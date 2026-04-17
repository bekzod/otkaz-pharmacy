const { createCrawlerService } = require('../src/crawler-telegram/service');

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createUpdatableRecord(store, prefix, attributes) {
  const record = {
    id: attributes.id || `${prefix}-${store.length + 1}`,
    ...attributes,
    async update(nextAttributes) {
      Object.assign(record, nextAttributes);
      return record;
    },
  };

  store.push(record);
  return record;
}

function matchesWhere(record, where) {
  return Object.entries(where).every(([key, value]) => record[key] === value);
}

function createMemoryModels() {
  const messages = [];
  const images = [];
  const entries = [];

  const models = {
    sequelize: {
      close: jest.fn().mockResolvedValue(),
    },
    TelegramGroup: {
      findAll: jest.fn().mockResolvedValue([]),
    },
    TelegramMessage: {
      async findOrCreate({ where, defaults }) {
        const existing = messages.find((record) => matchesWhere(record, where));
        if (existing) return [existing, false];
        return [createUpdatableRecord(messages, 'message', defaults), true];
      },
    },
    TelegramMessageImage: {
      async findOne({ where }) {
        return images.find((record) => matchesWhere(record, where)) || null;
      },
      async create(attributes) {
        return createUpdatableRecord(images, 'image', attributes);
      },
    },
    TelegramMedicineEntry: {
      async findOne({ where }) {
        return entries.find((record) => matchesWhere(record, where)) || null;
      },
      async create(attributes) {
        return createUpdatableRecord(entries, 'entry', attributes);
      },
    },
    __store: {
      messages,
      images,
      entries,
    },
  };

  return models;
}

describe('crawler service', () => {
  test('starts once, reports status, and stops without exiting the process', async () => {
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    const processExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit should not be called');
    });

    let service;
    const models = createMemoryModels();

    const client = {
      connected: true,
      disconnect: jest.fn().mockResolvedValue(),
      getMessages: jest.fn().mockResolvedValue([]),
    };

    models.TelegramGroup.findAll.mockImplementation(async () => {
      setImmediate(() => {
        service.stopCrawler();
      });
      return [];
    });

    service = createCrawlerService({
      telegramClientFactory: jest.fn(() => client),
      models,
      medicineResolver: {
        resolve: jest.fn(),
      },
      imageTextExtractor: {
        extractLines: jest.fn(),
      },
      time: {
        now: () => new Date('2026-04-17T10:00:00.000Z'),
        wait: jest.fn(
          () =>
            new Promise((resolve) => {
              setImmediate(resolve);
            }),
        ),
      },
    });

    try {
      const [firstStartStatus] = await Promise.all([service.startCrawler(), service.startCrawler()]);
      await flush();
      await service.stopCrawler();
      const statusAfterStop = service.getCrawlerStatus();

      expect(firstStartStatus.running).toBe(true);
      expect(firstStartStatus.state).toBe('running');
      expect(statusAfterStop.totalIterations).toBe(1);
      expect(statusAfterStop.running).toBe(false);
      expect(statusAfterStop.state).toBe('stopped');
      expect(models.TelegramGroup.findAll).toHaveBeenCalledTimes(1);
      expect(models.sequelize.close).toHaveBeenCalledTimes(1);
      expect(client.disconnect).toHaveBeenCalledTimes(1);
      expect(processExit).not.toHaveBeenCalled();
    } finally {
      consoleLog.mockRestore();
      processExit.mockRestore();
    }
  });

  test('creates one medicine entry for a text message', async () => {
    const models = createMemoryModels();
    const medicineResolver = {
      resolve: jest.fn().mockResolvedValue({
        resolverStatus: 'resolved',
        medicineId: 'medicine-123',
        parserResult: {
          normalized_query: 'парацетамол 500 мг',
        },
      }),
    };

    const service = createCrawlerService({
      models,
      medicineResolver,
      imageTextExtractor: {
        extractLines: jest.fn(),
      },
      time: {
        now: () => new Date('2026-04-17T10:00:00.000Z'),
        wait: jest.fn().mockResolvedValue(),
      },
    });

    const client = {
      getMessages: jest.fn().mockResolvedValue([
        {
          id: 101,
          date: 1713348000,
          message: '  парацетамол 500 мг  ',
          media: null,
        },
      ]),
    };

    const group = {
      id: 77,
      name: 'Test Group',
      update: jest.fn().mockResolvedValue(),
    };

    const persistedCount = await service.crawlGroup(client, group);

    expect(persistedCount).toBe(1);
    expect(models.__store.messages).toHaveLength(1);
    expect(models.__store.entries).toHaveLength(1);
    expect(models.__store.entries[0]).toMatchObject({
      message_id: models.__store.messages[0].id,
      message_image_id: null,
      source_type: 'message_text',
      source_index: 0,
      source_text: 'парацетамол 500 мг',
      medicine_id: 'medicine-123',
      resolver_status: 'resolved',
      parser_result: {
        normalized_query: 'парацетамол 500 мг',
      },
    });
    expect(medicineResolver.resolve).toHaveBeenCalledWith('парацетамол 500 мг', {
      label: 'message 101 text',
    });
    expect(group.update).toHaveBeenCalledTimes(1);
  });

  test('uses a 50-message initial window when group has never been crawled', async () => {
    const models = createMemoryModels();
    const service = createCrawlerService({
      models,
      medicineResolver: {
        resolve: jest.fn().mockResolvedValue({
          resolverStatus: 'resolved',
          medicineId: null,
          parserResult: { normalized_query: null },
        }),
      },
      imageTextExtractor: { extractLines: jest.fn() },
      time: {
        now: () => new Date('2026-04-17T10:00:00.000Z'),
        wait: jest.fn().mockResolvedValue(),
      },
    });

    const client = {
      getMessages: jest.fn().mockResolvedValue([]),
    };

    await service.crawlGroup(client, {
      id: 77,
      name: 'Fresh Group',
      update: jest.fn().mockResolvedValue(),
    });

    expect(client.getMessages).toHaveBeenCalledWith(77, {
      limit: 50,
    });
  });

  test('stores not_found entry when resolver returns 404-style result', async () => {
    const models = createMemoryModels();
    const medicineResolver = {
      resolve: jest.fn().mockResolvedValue({
        resolverStatus: 'not_found',
        medicineId: null,
        parserResult: {
          normalized_query: 'unknown med',
        },
      }),
    };

    const service = createCrawlerService({
      models,
      medicineResolver,
      imageTextExtractor: {
        extractLines: jest.fn(),
      },
      time: {
        now: () => new Date('2026-04-17T10:00:00.000Z'),
        wait: jest.fn().mockResolvedValue(),
      },
    });

    await service.crawlGroup(
      {
        getMessages: jest.fn().mockResolvedValue([
          {
            id: 102,
            date: 1713348000,
            message: 'unknown med',
            media: null,
          },
        ]),
      },
      {
        id: 77,
        name: 'Test Group',
        update: jest.fn().mockResolvedValue(),
      },
    );

    expect(models.__store.entries).toHaveLength(1);
    expect(models.__store.entries[0]).toMatchObject({
      source_text: 'unknown med',
      medicine_id: null,
      resolver_status: 'not_found',
      parser_result: {
        normalized_query: 'unknown med',
      },
    });
  });

  test('creates text and image line entries once and skips duplicate work on recrawl', async () => {
    const models = createMemoryModels();
    const medicineResolver = {
      resolve: jest
        .fn()
        .mockResolvedValueOnce({
          resolverStatus: 'resolved',
          medicineId: 'medicine-text',
          parserResult: { normalized_query: 'caption text' },
        })
        .mockResolvedValueOnce({
          resolverStatus: 'resolved',
          medicineId: 'medicine-line-1',
          parserResult: { normalized_query: 'парацетамол 500 мг' },
        })
        .mockResolvedValueOnce({
          resolverStatus: 'resolved',
          medicineId: 'medicine-line-2',
          parserResult: { normalized_query: 'ибупрофен 200 мг' },
        }),
    };
    const imageTextExtractor = {
      extractLines: jest.fn().mockResolvedValue({
        status: 'completed',
        model: 'gpt-5-mini',
        lines: ['парацетамол 500 мг', 'ибупрофен 200 мг'],
        errorMessage: null,
      }),
    };

    const service = createCrawlerService({
      models,
      medicineResolver,
      imageTextExtractor,
      time: {
        now: () => new Date('2026-04-17T10:00:00.000Z'),
        wait: jest.fn().mockResolvedValue(),
      },
    });

    const message = {
      id: 103,
      date: 1713348000,
      message: 'caption text',
      media: {
        photo: {
          id: 7001,
          sizes: [{ w: 100, h: 200 }],
        },
      },
    };

    const client = {
      getMessages: jest.fn().mockResolvedValue([message]),
      downloadMedia: jest.fn().mockResolvedValue(Buffer.from('image-bytes')),
    };

    const group = {
      id: 77,
      name: 'Test Group',
      update: jest.fn().mockResolvedValue(),
    };

    await service.crawlGroup(client, group);
    await service.crawlGroup(client, group);

    expect(models.__store.images).toHaveLength(1);
    expect(models.__store.images[0]).toMatchObject({
      text_extraction_status: 'completed',
      text_extraction_model: 'gpt-5-mini',
      text_extracted_lines: ['парацетамол 500 мг', 'ибупрофен 200 мг'],
    });
    expect(models.__store.entries).toHaveLength(3);
    expect(models.__store.entries.map((entry) => entry.source_text)).toEqual([
      'caption text',
      'парацетамол 500 мг',
      'ибупрофен 200 мг',
    ]);
    expect(medicineResolver.resolve.mock.calls.map(([text]) => text)).toEqual([
      'caption text',
      'парацетамол 500 мг',
      'ибупрофен 200 мг',
    ]);
    expect(imageTextExtractor.extractLines).toHaveBeenCalledTimes(1);
  });

  test('keeps image and creates no image entries when extraction fails', async () => {
    const models = createMemoryModels();
    const imageTextExtractor = {
      extractLines: jest.fn().mockResolvedValue({
        status: 'failed',
        model: 'gpt-5-mini',
        lines: [],
        errorMessage: 'model failed',
      }),
    };

    const service = createCrawlerService({
      models,
      medicineResolver: {
        resolve: jest.fn(),
      },
      imageTextExtractor,
      time: {
        now: () => new Date('2026-04-17T10:00:00.000Z'),
        wait: jest.fn().mockResolvedValue(),
      },
    });

    await service.crawlGroup(
      {
        getMessages: jest.fn().mockResolvedValue([
          {
            id: 104,
            date: 1713348000,
            message: '',
            media: {
              photo: {
                id: 7002,
                sizes: [{ w: 100, h: 200 }],
              },
            },
          },
        ]),
        downloadMedia: jest.fn().mockResolvedValue(Buffer.from('image-bytes')),
      },
      {
        id: 77,
        name: 'Test Group',
        update: jest.fn().mockResolvedValue(),
      },
    );

    expect(models.__store.images).toHaveLength(1);
    expect(models.__store.images[0]).toMatchObject({
      text_extraction_status: 'failed',
      text_extraction_model: 'gpt-5-mini',
      text_extracted_lines: null,
      text_extraction_error: 'model failed',
    });
    expect(models.__store.entries).toHaveLength(0);
  });
});
