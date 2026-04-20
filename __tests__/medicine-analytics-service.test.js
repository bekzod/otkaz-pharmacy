const { Op } = require('sequelize');
const { createMedicineAnalyticsService } = require('../src/server/medicineAnalyticsService');

function createRowCommentModel() {
  const records = [];
  let nextId = 1;

  function attachInstanceMethods(record) {
    record.save = async () => record;
    record.destroy = async () => {
      const index = records.indexOf(record);
      if (index >= 0) records.splice(index, 1);
    };
    return record;
  }

  return {
    _records: records,

    async findOne({ where }) {
      const candidates = records.filter(
        (record) =>
          record.dimension === where.dimension && record.row_key === where.row_key,
      );

      if (where.deleted_at === null) {
        return candidates.find((record) => record.deleted_at === null) || null;
      }

      if (where.deleted_at && where.deleted_at[Op.between]) {
        const [start, end] = where.deleted_at[Op.between];
        const matching = candidates
          .filter(
            (record) =>
              record.deleted_at instanceof Date &&
              record.deleted_at.getTime() >= start.getTime() &&
              record.deleted_at.getTime() <= end.getTime(),
          )
          .sort((a, b) => b.deleted_at.getTime() - a.deleted_at.getTime());
        return matching[0] || null;
      }

      return null;
    },

    async create(values) {
      const record = attachInstanceMethods({
        id: `rc-${nextId++}`,
        dimension: values.dimension,
        row_key: values.row_key,
        comment: values.comment,
        deleted_at: values.deleted_at || null,
      });
      records.push(record);
      return record;
    },

    async update(values, { where }) {
      const toUpdate = records.filter(
        (record) =>
          record.dimension === where.dimension &&
          record.row_key === where.row_key &&
          (where.deleted_at === null ? record.deleted_at === null : true),
      );
      toUpdate.forEach((record) => Object.assign(record, values));
      return [toUpdate.length];
    },
  };
}

function createRowResolutionModel() {
  const records = [];
  let nextId = 1;

  function attachInstanceMethods(record) {
    record.save = async () => record;
    record.destroy = async () => {
      record.deleted_at = new Date();
    };
    return record;
  }

  return {
    _records: records,

    async findOne({ where }) {
      const candidates = records.filter(
        (record) =>
          record.dimension === where.dimension && record.row_key === where.row_key,
      );

      if (where.deleted_at === null) {
        return candidates.find((record) => record.deleted_at === null) || null;
      }

      return null;
    },

    async create(values) {
      const record = attachInstanceMethods({
        id: `rr-${nextId++}`,
        dimension: values.dimension,
        row_key: values.row_key,
        resolved_at: values.resolved_at,
        deleted_at: null,
      });
      records.push(record);
      return record;
    },
  };
}

function createResetPointModel() {
  const records = [];
  let nextId = 1;

  function attachInstanceMethods(record) {
    record.destroy = async () => {
      const index = records.indexOf(record);
      if (index >= 0) records.splice(index, 1);
    };
    return record;
  }

  return {
    _records: records,

    async create(values) {
      const record = attachInstanceMethods({
        id: `rp-${nextId++}`,
        dimension: values.dimension,
        reset_key: values.reset_key,
        reset_at: values.reset_at,
        created_at: values.reset_at,
      });
      records.push(record);
      return record;
    },

    async findOne({ where, order }) {
      const matching = records
        .filter(
          (record) =>
            record.dimension === where.dimension && record.reset_key === where.reset_key,
        )
        .slice()
        .sort((a, b) => b.reset_at.getTime() - a.reset_at.getTime());
      return matching[0] || null;
    },
  };
}

function createSequelizeStub(queryImpl) {
  return {
    query: queryImpl || jest.fn().mockResolvedValue([]),
    transaction: async (fn) => fn({}),
  };
}

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
    sequelize: createSequelizeStub(),
    ResetPoint: createResetPointModel(),
    IgnoredSourceText: createIgnoredSourceTextModel(),
    IgnoredDimensionValue: createIgnoredDimensionValueModel(),
    RowComment: createRowCommentModel(),
    RowResolution: createRowResolutionModel(),
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

  test('left-joins row_comments in the analytics query', async () => {
    const models = buildModels();
    const service = createMedicineAnalyticsService({
      models,
      now: () => new Date('2026-04-18T12:00:00.000Z'),
    });

    await service.getAnalytics();

    const executedQueries = models.sequelize.query.mock.calls.map(([query]) => query);
    executedQueries.forEach((query) => {
      expect(query).toContain('row_comments');
      expect(query).toContain('rc.deleted_at IS NULL');
      expect(query).toMatch(/MIN\(rc\.comment\)/);
    });
  });

  test('setRowComment creates an active comment and upserts on subsequent calls', async () => {
    const models = buildModels();
    const service = createMedicineAnalyticsService({
      models,
      now: () => new Date('2026-04-18T12:00:00.000Z'),
    });

    const created = await service.setRowComment({
      dimension: 'trade_name',
      resetKey: 'Aspirin',
      comment: '  watch closely  ',
    });

    expect(created.comment.text).toBe('watch closely');
    expect(models.RowComment._records).toHaveLength(1);
    expect(models.RowComment._records[0]).toMatchObject({
      dimension: 'trade_name',
      row_key: 'aspirin',
      comment: 'watch closely',
      deleted_at: null,
    });

    await service.setRowComment({
      dimension: 'trade_name',
      resetKey: 'aspirin',
      comment: 'updated',
    });

    expect(models.RowComment._records).toHaveLength(1);
    expect(models.RowComment._records[0].comment).toBe('updated');
  });

  test('setRowComment rejects empty or overly long comments', async () => {
    const service = createMedicineAnalyticsService({
      models: buildModels(),
      now: () => new Date('2026-04-18T12:00:00.000Z'),
    });

    await expect(
      service.setRowComment({ dimension: 'name', resetKey: 'ibuprofen', comment: '   ' }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      service.setRowComment({
        dimension: 'name',
        resetKey: 'ibuprofen',
        comment: 'x'.repeat(2001),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('deleteRowComment hard-deletes the active comment and 404s when missing', async () => {
    const models = buildModels();
    const service = createMedicineAnalyticsService({
      models,
      now: () => new Date('2026-04-18T12:00:00.000Z'),
    });

    await service.setRowComment({
      dimension: 'name',
      resetKey: 'paracetamol',
      comment: 'note',
    });
    expect(models.RowComment._records).toHaveLength(1);

    await service.deleteRowComment({ dimension: 'name', resetKey: 'paracetamol' });
    expect(models.RowComment._records).toHaveLength(0);

    await expect(
      service.deleteRowComment({ dimension: 'name', resetKey: 'paracetamol' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('createResetPoint soft-deletes the active comment and undo restores it', async () => {
    const models = buildModels();
    const baseNow = new Date('2026-04-18T12:00:00.000Z');
    const service = createMedicineAnalyticsService({
      models,
      now: () => baseNow,
    });

    await service.setRowComment({
      dimension: 'trade_name',
      resetKey: 'aspirin',
      comment: 'follow up',
    });

    await service.createResetPoint({
      dimension: 'trade_name',
      resetKey: 'aspirin',
    });

    expect(models.RowComment._records).toHaveLength(1);
    expect(models.RowComment._records[0].deleted_at).toEqual(baseNow);
    expect(models.ResetPoint._records).toHaveLength(1);

    await service.undoLatestResetPoint({
      dimension: 'trade_name',
      resetKey: 'aspirin',
      nowValue: new Date(baseNow.getTime() + 60 * 1000),
    });

    expect(models.ResetPoint._records).toHaveLength(0);
    expect(models.RowComment._records).toHaveLength(1);
    expect(models.RowComment._records[0].deleted_at).toBeNull();
    expect(models.RowComment._records[0].comment).toBe('follow up');
  });

  test('undoLatestResetPoint does not restore stale comments from earlier resets', async () => {
    const models = buildModels();
    const service = createMedicineAnalyticsService({ models });

    const firstNow = new Date('2026-04-18T10:00:00.000Z');
    await service.setRowComment({
      dimension: 'trade_name',
      resetKey: 'aspirin',
      comment: 'stale note',
      nowValue: firstNow,
    });
    await service.createResetPoint({
      dimension: 'trade_name',
      resetKey: 'aspirin',
      nowValue: firstNow,
    });

    const secondNow = new Date('2026-04-18T12:00:00.000Z');
    await service.createResetPoint({
      dimension: 'trade_name',
      resetKey: 'aspirin',
      nowValue: secondNow,
    });

    await service.undoLatestResetPoint({
      dimension: 'trade_name',
      resetKey: 'aspirin',
      nowValue: new Date(secondNow.getTime() + 60 * 1000),
    });

    expect(models.RowComment._records).toHaveLength(1);
    expect(models.RowComment._records[0].deleted_at).toEqual(firstNow);
  });

  test('left-joins row_resolutions in the analytics query with auto-unresolve logic', async () => {
    const models = buildModels();
    const service = createMedicineAnalyticsService({
      models,
      now: () => new Date('2026-04-18T12:00:00.000Z'),
    });

    await service.getAnalytics();

    const executedQueries = models.sequelize.query.mock.calls.map(([query]) => query);
    executedQueries.forEach((query) => {
      expect(query).toContain('row_resolutions');
      expect(query).toContain('latest_resolutions');
      expect(query).toContain('rr.deleted_at IS NULL');
      expect(query).toMatch(/re2\.event_at > lres\.resolved_at/);
    });
  });

  test('resolveRow inserts a row_resolutions record and refreshes resolved_at on second call', async () => {
    const models = buildModels();
    const firstNow = new Date('2026-04-18T12:00:00.000Z');
    const service = createMedicineAnalyticsService({
      models,
      now: () => firstNow,
    });

    await service.resolveRow({
      dimension: 'trade_name',
      resetKey: 'Aspirin',
    });

    expect(models.RowResolution._records).toHaveLength(1);
    expect(models.RowResolution._records[0]).toMatchObject({
      dimension: 'trade_name',
      row_key: 'aspirin',
      deleted_at: null,
    });
    expect(models.RowResolution._records[0].resolved_at).toEqual(firstNow);

    const secondNow = new Date('2026-04-18T13:00:00.000Z');
    await service.resolveRow({
      dimension: 'trade_name',
      resetKey: 'aspirin',
      nowValue: secondNow,
    });

    expect(models.RowResolution._records).toHaveLength(1);
    expect(models.RowResolution._records[0].resolved_at).toEqual(secondNow);
  });

  test('unresolveRow soft-deletes the active resolution and 404s when missing', async () => {
    const models = buildModels();
    const service = createMedicineAnalyticsService({
      models,
      now: () => new Date('2026-04-18T12:00:00.000Z'),
    });

    await service.resolveRow({ dimension: 'name', resetKey: 'paracetamol' });
    expect(models.RowResolution._records[0].deleted_at).toBeNull();

    await service.unresolveRow({ dimension: 'name', resetKey: 'paracetamol' });
    expect(models.RowResolution._records[0].deleted_at).toBeInstanceOf(Date);

    await expect(
      service.unresolveRow({ dimension: 'name', resetKey: 'paracetamol' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('getAnalytics surfaces isResolved and resolvedAt from the query row', async () => {
    const models = buildModels();
    const resolvedAt = new Date('2026-04-18T11:00:00.000Z');
    models.sequelize.query = jest.fn().mockResolvedValue([
      {
        key: 'aspirin',
        label: 'Aspirin',
        medicine_id: null,
        last_reset_at: null,
        resolved_at: resolvedAt,
        is_resolved: true,
        comment: null,
        count_1d: 0,
        count_3d: 0,
        count_30d: 0,
        count_90d: 5,
      },
    ]);

    const service = createMedicineAnalyticsService({
      models,
      now: () => new Date('2026-04-18T12:00:00.000Z'),
    });

    const analytics = await service.getAnalytics();
    expect(analytics.tradeName[0]).toMatchObject({
      key: 'aspirin',
      isResolved: true,
      resolvedAt: resolvedAt.toISOString(),
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
