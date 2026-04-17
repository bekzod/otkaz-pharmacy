require('dotenv').config();

const { parseMedicineQuery } = require('../common/parser');
const logger = require('../common/logger').child({ component: 'medicine-resolver' });

const DEFAULT_BASE_URL = 'https://pharmacy-analytics.onrender.com';
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;

function wait(ms = 3000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientStatus(status) {
  return status === 429 || status >= 500;
}

function isTransientError(error) {
  if (!error) return false;
  if (error.code === 'MEDICINE_LOOKUP_TIMEOUT') return true;
  if (error.name === 'AbortError') return true;
  if (error.name === 'TypeError') return true;
  return Boolean(error.status && isTransientStatus(error.status));
}

async function fetchWithTimeout(fetchFn, url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchFn(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(`timed out after ${timeoutMs}ms`);
      timeoutError.code = 'MEDICINE_LOOKUP_TIMEOUT';
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildLookupUrl(baseUrl, query) {
  const url = new URL('/api/medicine-lookup', baseUrl);
  url.searchParams.set('string', query);
  return url.toString();
}

function createMedicineResolver({
  fetchFn = global.fetch,
  time = { wait },
  logger: customLogger = logger,
  settings = {},
} = {}) {
  const config = {
    MEDICINE_LOOKUP_BASE_URL: process.env.MEDICINE_LOOKUP_BASE_URL || DEFAULT_BASE_URL,
    MEDICINE_LOOKUP_BASIC_AUTH_USERNAME: process.env.MEDICINE_LOOKUP_BASIC_AUTH_USERNAME || '',
    MEDICINE_LOOKUP_BASIC_AUTH_PASSWORD: process.env.MEDICINE_LOOKUP_BASIC_AUTH_PASSWORD || '',
    MEDICINE_LOOKUP_TIMEOUT_MS:
      Number(process.env.MEDICINE_LOOKUP_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    MEDICINE_LOOKUP_RETRY_ATTEMPTS:
      Number(process.env.MEDICINE_LOOKUP_RETRY_ATTEMPTS) || DEFAULT_RETRY_ATTEMPTS,
    MEDICINE_LOOKUP_RETRY_BASE_DELAY_MS:
      Number(process.env.MEDICINE_LOOKUP_RETRY_BASE_DELAY_MS) || DEFAULT_RETRY_BASE_DELAY_MS,
    ...settings,
  };

  async function resolve(query, { label = query } = {}) {
    const normalizedQuery = typeof query === 'string' ? query.trim() : '';
    const parserResult = normalizedQuery ? parseMedicineQuery(normalizedQuery) : null;

    const fail = (errorMessage = 'Medicine lookup failed') => ({
      resolverStatus: 'lookup_failed',
      medicineId: null,
      parserResult,
      errorMessage,
    });

    if (!normalizedQuery) {
      return fail('Cannot resolve an empty medicine query');
    }

    if (typeof fetchFn !== 'function') {
      return fail('Global fetch is unavailable for medicine lookup');
    }

    if (
      !config.MEDICINE_LOOKUP_BASIC_AUTH_USERNAME ||
      !config.MEDICINE_LOOKUP_BASIC_AUTH_PASSWORD
    ) {
      return fail('Medicine lookup credentials are not configured');
    }

    const auth = Buffer.from(
      `${config.MEDICINE_LOOKUP_BASIC_AUTH_USERNAME}:${config.MEDICINE_LOOKUP_BASIC_AUTH_PASSWORD}`,
      'utf8',
    ).toString('base64');

    let lastErrorMessage = 'Medicine lookup failed';

    for (let attempt = 1; attempt <= config.MEDICINE_LOOKUP_RETRY_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetchWithTimeout(
          fetchFn,
          buildLookupUrl(config.MEDICINE_LOOKUP_BASE_URL, normalizedQuery),
          {
            method: 'GET',
            headers: {
              authorization: `Basic ${auth}`,
            },
          },
          config.MEDICINE_LOOKUP_TIMEOUT_MS,
        );

        let body = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }

        if (response.status === 200) {
          return {
            resolverStatus: 'resolved',
            medicineId: body?.data?.id || null,
            parserResult,
            errorMessage: null,
          };
        }

        if (response.status === 404) {
          return {
            resolverStatus: 'not_found',
            medicineId: null,
            parserResult,
            errorMessage: null,
          };
        }

        lastErrorMessage = `request failed with status ${response.status}`;
        if (!isTransientStatus(response.status)) {
          customLogger.warn({ label, errorMessage: lastErrorMessage }, 'request failed');
          return fail(lastErrorMessage);
        }
      } catch (error) {
        lastErrorMessage = error?.message || 'Medicine lookup request failed';

        if (!isTransientError(error)) {
          customLogger.warn({ label, errorMessage: lastErrorMessage }, 'request failed');
          return fail(lastErrorMessage);
        }
      }

      if (attempt < config.MEDICINE_LOOKUP_RETRY_ATTEMPTS) {
        customLogger.warn(
          {
            label,
            attempt,
            attempts: config.MEDICINE_LOOKUP_RETRY_ATTEMPTS,
            errorMessage: lastErrorMessage,
          },
          'transient failure, retrying',
        );
        await time.wait(
          config.MEDICINE_LOOKUP_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
        );
        continue;
      }

      customLogger.warn(
        {
          label,
          attempts: config.MEDICINE_LOOKUP_RETRY_ATTEMPTS,
          errorMessage: lastErrorMessage,
        },
        'failed after retries',
      );
    }

    return fail(lastErrorMessage);
  }

  return {
    resolve,
  };
}

module.exports = {
  createMedicineResolver,
};
