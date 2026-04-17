require('dotenv').config();

const OpenAI = require('openai');
const logger = require('../common/logger').child({ component: 'image-text-extractor' });

const DEFAULT_MODEL = 'gpt-5.4-mini';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;

const EXTRACTION_PROMPT = [
  'Extract medicine candidate text from this image.',
  'Return only visible text lines in reading order.',
  'Preserve one line per array item.',
  'Trim surrounding whitespace.',
  'Drop empty lines.',
  'Do not translate, combine, or invent text.',
].join(' ');

function wait(ms = 3000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(error) {
  if (!error) return false;
  if (error.code === 'OPENAI_IMAGE_TEXT_TIMEOUT') return true;
  if (error.name === 'AbortError') return true;
  if (error.name === 'APIConnectionError') return true;
  if (error.name === 'APIConnectionTimeoutError') return true;
  if (error.status === 429) return true;
  return Boolean(error.status && error.status >= 500);
}

function normalizeLines(lines) {
  if (!Array.isArray(lines)) return [];

  return lines
    .map((line) => (typeof line === 'string' ? line.trim() : ''))
    .filter(Boolean);
}

function createDataUrl(buffer, mimeType = 'image/jpeg') {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function createOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function createImageTextExtractor({
  openaiClient,
  time = { wait },
  logger: customLogger = logger,
  settings = {},
} = {}) {
  const config = {
    OPENAI_IMAGE_TEXT_MODEL: process.env.OPENAI_IMAGE_TEXT_MODEL || DEFAULT_MODEL,
    OPENAI_IMAGE_TEXT_TIMEOUT_MS:
      Number(process.env.OPENAI_IMAGE_TEXT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    OPENAI_IMAGE_TEXT_RETRY_ATTEMPTS:
      Number(process.env.OPENAI_IMAGE_TEXT_RETRY_ATTEMPTS) || DEFAULT_RETRY_ATTEMPTS,
    OPENAI_IMAGE_TEXT_RETRY_BASE_DELAY_MS:
      Number(process.env.OPENAI_IMAGE_TEXT_RETRY_BASE_DELAY_MS) || DEFAULT_RETRY_BASE_DELAY_MS,
    ...settings,
  };

  const client = openaiClient ?? createOpenAIClient();

  async function extractLines({ buffer, mimeType, label = 'telegram image' } = {}) {
    const fail = (errorMessage = 'Image text extraction failed') => ({
      status: 'failed',
      model: config.OPENAI_IMAGE_TEXT_MODEL,
      lines: [],
      errorMessage,
    });

    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return fail('Image buffer is empty');
    }

    if (!client) {
      return fail('OPENAI_API_KEY is not configured');
    }

    let lastErrorMessage = 'Image text extraction failed';

    for (let attempt = 1; attempt <= config.OPENAI_IMAGE_TEXT_RETRY_ATTEMPTS; attempt += 1) {
      try {
        const response = await client.responses.create(
          {
            model: config.OPENAI_IMAGE_TEXT_MODEL,
            store: false,
            max_output_tokens: 600,
            input: [
              {
                role: 'user',
                content: [
                  {
                    type: 'input_text',
                    text: EXTRACTION_PROMPT,
                  },
                  {
                    type: 'input_image',
                    image_url: createDataUrl(buffer, mimeType),
                    detail: 'high',
                  },
                ],
              },
            ],
            text: {
              format: {
                type: 'json_schema',
                name: 'telegram_image_text_lines',
                strict: true,
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    lines: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                  required: ['lines'],
                },
              },
            },
          },
          {
            timeout: config.OPENAI_IMAGE_TEXT_TIMEOUT_MS,
          },
        );

        const parsed = JSON.parse(response.output_text || '{}');
        return {
          status: 'completed',
          model: config.OPENAI_IMAGE_TEXT_MODEL,
          lines: normalizeLines(parsed?.lines),
          errorMessage: null,
        };
      } catch (error) {
        lastErrorMessage = error?.message || 'Image text extraction failed';

        if (!isTransientError(error)) {
          customLogger.warn({ label, errorMessage: lastErrorMessage }, 'request failed');
          return fail(lastErrorMessage);
        }
      }

      if (attempt < config.OPENAI_IMAGE_TEXT_RETRY_ATTEMPTS) {
        customLogger.warn(
          {
            label,
            attempt,
            attempts: config.OPENAI_IMAGE_TEXT_RETRY_ATTEMPTS,
            errorMessage: lastErrorMessage,
          },
          'transient failure, retrying',
        );
        await time.wait(
          config.OPENAI_IMAGE_TEXT_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
        );
        continue;
      }

      customLogger.warn(
        {
          label,
          attempts: config.OPENAI_IMAGE_TEXT_RETRY_ATTEMPTS,
          errorMessage: lastErrorMessage,
        },
        'failed after retries',
      );
    }

    return fail(lastErrorMessage);
  }

  return {
    extractLines,
  };
}

module.exports = {
  createImageTextExtractor,
};
