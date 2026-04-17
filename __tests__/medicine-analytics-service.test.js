const { createMedicineAnalyticsService } = require('../src/server/medicineAnalyticsService');

function createIgnoredSourceTextModel() {
  const records = [];

  return {
    async findOrCreate({ where, defaults }) {
      const existing = records.find((record) => record.source_text === where.source_text);
      if (existing) {
        return [existing, false];
      }

      const created = {
        id: `ignored-${records.length + 1}`,
        source_text: defaults.source_text,
        created_at: new Date('2026-04-18T10:00:00.000Z'),
        updated_at: new Date('2026-04-18T10:00:00.000Z'),
        async destroy() {
          const index = records.indexOf(created);
          if (index >= 0) records.splice(index, 1);
        },
      };

      records.push(created);
      return [created, true];
    },

    async findOne({ where }) {
      return (
        records.find((record) => record.source_text === where.source_text) || null
      );
    },
  };
}

function createIgnoredDimensionValueModel() {
  const records = [];

  return {
    async findAll() {
      return records.slice();
    },

    async findOrCreate({ where, defaults }) {
      const existing = records.find(
        (record) => record.dimension === where.dimension && record.key === where.key,
      );
      if (existing) return [existing, false];

      const created = {
        id: `idv-${records.length + 1}`,
        dimension: defaults.dimension,
        key: defaults.key,
        created_at: new Date('2026-04-18T10:00:00.000Z'),
        updated_at: new Date('2026-04-18T10:00:00.000Z'),
        async destroy() {
          const index = records.indexOf(created);
          if (index >= 0) records.splice(index, 1);
        },
      };

      records.push(created);
      return [created, true];
    },

    async findOne({ where }) {
      return (
        records.find(
          (record) => record.dimension === where.dimension && record.key === where.key,
        ) || null
      );
    },
  };
}

function buildModels(overrides = {}) {
  return {
    sequelize: { query: jest.fn().mockResolvedValue([]) },
    ResetPoint: {},
    IgnoredSourceText: createIgnoredSourceTextModel(),
    IgnoredDimensionValue: createIgnoredDimensionValueModel(),
    ...overrides,
  };
}

describe('medicine analytics service', () => {
  test('prefers canonical parser trade name for trade-name analytics grouping', async () => {
    const models = buildModels();
    const service = createMedicineAnalyticsService({
      models,
      now: () => new Date('2026-04-18T12:00:00.000Z'),
    });

    await service.getAnalytics();

    const executedQueries = models.sequelize.query.mock.calls.map(([query]) => query);
    expect(executedQueries).toHaveLength(3);
    expect(executedQueries[1]).toContain(`parser_result->>'trade_name'`);
    expect(executedQueries[2]).toContain(`parser_result->>'trade_name'`);
    expect(executedQueries[1].indexOf(`parser_result->>'trade_name'`)).toBeLessThan(
      executedQueries[1].indexOf(`parser_result->'attributes'->>'trade_name_text'`),
    );
  });

  test('filters ignored source texts and dimension values out of analytics and series queries', async () => {
    const models = buildModels();
    const service = createMedicineAnalyticsService({
      models,
      now: () => new Date('2026-04-18T12:00:00.000Z'),
    });

    await service.getAnalytics();
    await service.getSeries({ dimension: 'name', keys: ['paracetamol'] });

    const executedQueries = models.sequelize.query.mock.calls.map(([query]) => query);
    expect(executedQueries).toHaveLength(4);
    executedQueries.forEach((query) => {
      expect(query).toContain('ignored_source_texts');
      expect(query).toContain('ignored_dimension_values');
    });
  });

  test('normalizes source text when ignoring and restoring entries', async () => {
    const service = createMedicineAnalyticsService({
      models: buildModels(),
      now: () => new Date('2026-04-18T12:00:00.000Z'),
    });

    const ignored = await service.ignoreSourceText({
      sourceText: '   noisy    service   message   ',
    });

    expect(ignored.created).toBe(true);
    expect(ignored.ignoredText.sourceText).toBe('noisy service message');

    const restored = await service.restoreIgnoredSourceText({
      sourceText: ' noisy service message ',
    });

    expect(restored.restoredText.sourceText).toBe('noisy service message');
  });

  test('ignores and restores dimension values with normalized keys', async () => {
    const models = buildModels();
    const service = createMedicineAnalyticsService({
      models,
      now: () => new Date('2026-04-18T12:00:00.000Z'),
    });

    const ignored = await service.ignoreDimensionValue({
      dimension: 'tradeName',
      key: '  Aspirin  ',
    });

    expect(ignored.created).toBe(true);
    expect(ignored.ignoredDimensionValue).toEqual({
      id: expect.any(String),
      dimension: 'tradeName',
      key: 'aspirin',
    });

    const restored = await service.restoreIgnoredDimensionValue({
      dimension: 'tradeName',
      key: 'Aspirin',
    });

    expect(restored.restoredDimensionValue).toEqual({
      dimension: 'tradeName',
      key: 'aspirin',
    });
  });

  test('maps ignored rows including dimension values and source texts', async () => {
    const models = buildModels();
    models.sequelize.query = jest.fn().mockResolvedValue([
      {
        key: 'service message',
        label: 'service message',
        ignored_at: '2026-04-18T09:30:00.000Z',
        count_90d: '4',
      },
    ]);
    const service = createMedicineAnalyticsService({
      models,
      now: () => new Date('2026-04-18T12:00:00.000Z'),
    });

    await service.ignoreDimensionValue({ dimension: 'name', key: 'Paracetamol' });

    const payload = await service.getIgnoredTexts();

    expect(payload.rows).toEqual([
      expect.objectContaining({
        kind: 'dimensionValue',
        dimension: 'name',
        key: 'paracetamol',
        label: 'paracetamol',
      }),
      {
        kind: 'sourceText',
        key: 'service message',
        label: 'service message',
        ignoredAt: '2026-04-18T09:30:00.000Z',
        count90d: 4,
      },
    ]);
  });
});
