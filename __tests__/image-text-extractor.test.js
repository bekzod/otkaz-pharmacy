const { createImageTextExtractor } = require('../src/crawler-telegram/image-text-extractor');

describe('image text extractor', () => {
  test('extracts trimmed ordered lines using gpt-5.4-mini structured output', async () => {
    const openaiClient = {
      responses: {
        create: jest.fn().mockResolvedValue({
          output_text: JSON.stringify({
            lines: ['  парацетамол 500 мг  ', '', 'ибупрофен 200 мг'],
          }),
        }),
      },
    };

    const extractor = createImageTextExtractor({
      openaiClient,
      time: {
        wait: jest.fn().mockResolvedValue(),
      },
    });

    const result = await extractor.extractLines({
      buffer: Buffer.from('image-bytes'),
      mimeType: 'image/jpeg',
      label: 'message 5 image image-1',
    });

    expect(result).toEqual({
      status: 'completed',
      model: 'gpt-5.4-mini',
      lines: ['парацетамол 500 мг', 'ибупрофен 200 мг'],
      errorMessage: null,
    });
    expect(openaiClient.responses.create).toHaveBeenCalledTimes(1);
    expect(openaiClient.responses.create.mock.calls[0][0]).toMatchObject({
      model: 'gpt-5.4-mini',
      text: {
        format: {
          type: 'json_schema',
          name: 'telegram_image_text_lines',
        },
      },
    });
  });

  test('retries transient OpenAI errors with exponential backoff', async () => {
    const openaiClient = {
      responses: {
        create: jest
          .fn()
          .mockRejectedValueOnce({ status: 500, message: 'server error' })
          .mockResolvedValueOnce({
            output_text: JSON.stringify({
              lines: ['парацетамол 500 мг'],
            }),
          }),
      },
    };
    const time = {
      wait: jest.fn().mockResolvedValue(),
    };
    const extractor = createImageTextExtractor({
      openaiClient,
      time,
    });

    const result = await extractor.extractLines({
      buffer: Buffer.from('image-bytes'),
      mimeType: 'image/jpeg',
      label: 'message 6 image image-1',
    });

    expect(result.status).toBe('completed');
    expect(openaiClient.responses.create).toHaveBeenCalledTimes(2);
    expect(time.wait).toHaveBeenCalledWith(500);
  });
});
