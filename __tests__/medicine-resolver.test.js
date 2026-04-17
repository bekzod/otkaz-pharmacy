const { createMedicineResolver } = require('../src/crawler-telegram/medicine-resolver');
const { parseMedicineQuery } = require('../src/common/parser');

function createJsonResponse(status, json) {
  return {
    status,
    async json() {
      return json;
    },
  };
}

describe('medicine resolver', () => {
  test('parser emits a canonical trade name for analytics grouping', () => {
    expect(parseMedicineQuery('l-тироксин 50 берлин-хеми')).toMatchObject({
      trade_name: 'l-тироксин',
      attributes: {
        trade_name_text: 'l-тироксин 50 берлин-хеми',
      },
    });

    expect(parseMedicineQuery('кальций д3 никомед')).toMatchObject({
      trade_name: 'кальций д3 никомед',
    });
  });

  test('retries transient failures with exponential backoff and eventually succeeds', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(createJsonResponse(503, { error: 'busy' }))
      .mockResolvedValueOnce(createJsonResponse(503, { error: 'still busy' }))
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          data: { id: 'medicine-123' },
          parser: { normalized_query: 'парацетамол 500 мг' },
        }),
      );
    const time = {
      wait: jest.fn().mockResolvedValue(),
    };
    const resolver = createMedicineResolver({
      fetchFn,
      time,
      settings: {
        MEDICINE_LOOKUP_BASE_URL: 'https://example.com',
        MEDICINE_LOOKUP_BASIC_AUTH_USERNAME: 'user',
        MEDICINE_LOOKUP_BASIC_AUTH_PASSWORD: 'pass',
      },
    });

    const result = await resolver.resolve('парацетамол 500 мг', { label: 'message 1 text' });

    expect(result).toEqual({
      resolverStatus: 'resolved',
      medicineId: 'medicine-123',
      parserResult: parseMedicineQuery('парацетамол 500 мг'),
      errorMessage: null,
    });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(time.wait).toHaveBeenNthCalledWith(1, 500);
    expect(time.wait).toHaveBeenNthCalledWith(2, 1000);
  });

  test('returns not_found without retry and preserves parser output', async () => {
    const fetchFn = jest.fn().mockResolvedValue(
      createJsonResponse(404, {
        error: 'Medicine not found',
        parser: { normalized_query: 'unknown med' },
      }),
    );
    const time = {
      wait: jest.fn().mockResolvedValue(),
    };
    const resolver = createMedicineResolver({
      fetchFn,
      time,
      settings: {
        MEDICINE_LOOKUP_BASE_URL: 'https://example.com',
        MEDICINE_LOOKUP_BASIC_AUTH_USERNAME: 'user',
        MEDICINE_LOOKUP_BASIC_AUTH_PASSWORD: 'pass',
      },
    });

    const result = await resolver.resolve('unknown med', { label: 'message 2 text' });

    expect(result).toEqual({
      resolverStatus: 'not_found',
      medicineId: null,
      parserResult: parseMedicineQuery('unknown med'),
      errorMessage: null,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(time.wait).not.toHaveBeenCalled();
  });
});
