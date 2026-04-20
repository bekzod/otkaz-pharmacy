const { QueryTypes, Op } = require('sequelize');
const { normalizeCapturedText } = require('../common/capturedText');

const COMMENT_UNDO_MATCH_TOLERANCE_MS = 1000;
const COMMENT_MAX_LENGTH = 2000;

const DIMENSIONS = Object.freeze({
  name: {
    keyExpression: `
      LOWER(
        COALESCE(
          NULLIF(BTRIM(tme.parser_result->>'name'), ''),
          NULLIF(BTRIM(tme.parser_result->>'normalized_query'), ''),
          NULLIF(BTRIM(tme.source_text), '')
        )
      )
    `,
    labelExpression: `
      COALESCE(
        NULLIF(BTRIM(tme.parser_result->>'name'), ''),
        NULLIF(BTRIM(tme.parser_result->>'normalized_query'), ''),
        NULLIF(BTRIM(tme.source_text), '')
      )
    `,
  },
  trade_name: {
    keyExpression: `
      LOWER(
        COALESCE(
          NULLIF(BTRIM(tme.parser_result->>'trade_name'), ''),
          NULLIF(BTRIM(tme.parser_result->'attributes'->>'trade_name_text'), ''),
          NULLIF(BTRIM(tme.parser_result->>'name'), ''),
          NULLIF(BTRIM(tme.parser_result->>'normalized_query'), ''),
          NULLIF(BTRIM(tme.source_text), '')
        )
      )
    `,
    labelExpression: `
      COALESCE(
        NULLIF(BTRIM(tme.parser_result->>'trade_name'), ''),
        NULLIF(BTRIM(tme.parser_result->'attributes'->>'trade_name_text'), ''),
        NULLIF(BTRIM(tme.parser_result->>'name'), ''),
        NULLIF(BTRIM(tme.parser_result->>'normalized_query'), ''),
        NULLIF(BTRIM(tme.source_text), '')
      )
    `,
  },
  medicine_id: {
    keyExpression: `NULLIF(BTRIM(tme.medicine_id), '')`,
    labelExpression: `
      COALESCE(
        NULLIF(BTRIM(tme.parser_result->>'trade_name'), ''),
        NULLIF(BTRIM(tme.parser_result->'attributes'->>'trade_name_text'), ''),
        NULLIF(BTRIM(tme.parser_result->>'name'), ''),
        NULLIF(BTRIM(tme.parser_result->>'normalized_query'), ''),
        NULLIF(BTRIM(tme.source_text), ''),
        NULLIF(BTRIM(tme.medicine_id), '')
      )
    `,
  },
});

function buildNonIgnoredSourceTextCondition(alias = 'tme') {
  return `NOT EXISTS (
    SELECT 1
    FROM ignored_source_texts ist
    WHERE ist.source_text = ${alias}.source_text
  )`;
}

function buildNonIgnoredDimensionCondition(dimension, keyExpression) {
  return `NOT EXISTS (
    SELECT 1
    FROM ignored_dimension_values idv
    WHERE idv.dimension = '${dimension}'
      AND idv.key = ${keyExpression}
  )`;
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function resolveDate(value) {
  if (value instanceof Date) return new Date(value.getTime());

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid analytics timestamp');
  }

  return parsed;
}

function startOfUtcDay(value) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value, days) {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function normalizeResetKey(dimension, value) {
  if (typeof value !== 'string') {
    throw createHttpError(400, 'resetKey is required');
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw createHttpError(400, 'resetKey is required');
  }

  return dimension === 'medicine_id' ? trimmed : trimmed.toLowerCase();
}

function serializeResetPoint(record) {
  if (!record) return null;

  return {
    id: record.id,
    dimension: record.dimension,
    resetKey: record.reset_key,
    resetAt: record.reset_at instanceof Date ? record.reset_at.toISOString() : record.reset_at,
  };
}

function serializeIgnoredText(record) {
  if (!record) return null;

  return {
    id: record.id,
    sourceText: record.source_text,
    createdAt: record.created_at instanceof Date ? record.created_at.toISOString() : record.created_at,
    updatedAt: record.updated_at instanceof Date ? record.updated_at.toISOString() : record.updated_at,
  };
}

function normalizeIgnoredSourceText(value) {
  const normalized = normalizeCapturedText(value);
  if (!normalized) {
    throw createHttpError(400, 'sourceText is required');
  }

  return normalized;
}

function toPayloadKey(dimension) {
  if (dimension === 'trade_name') return 'tradeName';
  if (dimension === 'medicine_id') return 'medicineId';
  return 'name';
}

function fromPayloadKey(value) {
  if (value === 'tradeName' || value === 'trade_name') return 'trade_name';
  if (value === 'medicineId' || value === 'medicine_id') return 'medicine_id';
  if (value === 'name') return 'name';
  return null;
}

function buildDimensionQuery(dimension) {
  const config = DIMENSIONS[dimension];
  if (!config) {
    throw createHttpError(400, 'Unsupported analytics dimension');
  }

  const medicineIdExpression = `NULLIF(BTRIM(tme.medicine_id), '')`;
  const dimensionFilter = buildNonIgnoredDimensionCondition(dimension, config.keyExpression);

  return `
    WITH recent_entries AS (
      -- Split the time predicate so Postgres can use message_date and created_at indexes.
      SELECT
        tm.message_date AS event_at,
        ${config.keyExpression} AS reset_key,
        ${config.labelExpression} AS label,
        ${medicineIdExpression} AS medicine_id
      FROM telegram_messages tm
      JOIN telegram_medicine_entries tme ON tme.message_id = tm.id
      WHERE tm.message_date >= CAST(:windowStart AS timestamptz)
        AND ${config.keyExpression} IS NOT NULL
        AND ${buildNonIgnoredSourceTextCondition('tme')}
        AND ${dimensionFilter}

      UNION ALL

      SELECT
        tme.created_at AS event_at,
        ${config.keyExpression} AS reset_key,
        ${config.labelExpression} AS label,
        ${medicineIdExpression} AS medicine_id
      FROM telegram_messages tm
      JOIN telegram_medicine_entries tme ON tme.message_id = tm.id
      WHERE tm.message_date IS NULL
        AND tme.created_at >= CAST(:windowStart AS timestamptz)
        AND ${config.keyExpression} IS NOT NULL
        AND ${buildNonIgnoredSourceTextCondition('tme')}
        AND ${dimensionFilter}
    ),
    latest_resets AS (
      SELECT DISTINCT ON (rp.reset_key)
        rp.reset_key,
        rp.reset_at AS last_reset_at
      FROM reset_points rp
      WHERE rp.dimension = :dimension
      ORDER BY rp.reset_key, rp.reset_at DESC, rp.created_at DESC, rp.id DESC
    ),
    latest_resolutions AS (
      SELECT DISTINCT ON (rr.row_key)
        rr.row_key,
        rr.resolved_at
      FROM row_resolutions rr
      WHERE rr.dimension = :dimension
        AND rr.deleted_at IS NULL
      ORDER BY rr.row_key, rr.resolved_at DESC
    ),
    entry_rows AS (
      SELECT
        re.reset_key,
        MIN(re.label) AS label,
        MIN(re.medicine_id) AS medicine_id
      FROM recent_entries re
      GROUP BY re.reset_key
    ),
    candidate_rows AS (
      SELECT
        er.reset_key,
        er.label,
        er.medicine_id
      FROM entry_rows er
      UNION ALL
      SELECT
        lr.reset_key,
        lr.reset_key AS label,
        CASE
          WHEN :dimension = 'medicine_id' THEN lr.reset_key
          ELSE NULL::text
        END AS medicine_id
      FROM latest_resets lr
      WHERE lr.last_reset_at >= CAST(:windowStart AS timestamptz)
        AND NOT EXISTS (
          SELECT 1
          FROM entry_rows er
          WHERE er.reset_key = lr.reset_key
        )
    )
    SELECT
      cr.reset_key AS key,
      MIN(cr.label) AS label,
      CASE
        WHEN :dimension = 'medicine_id' THEN cr.reset_key
        ELSE MIN(cr.medicine_id)
      END AS medicine_id,
      lr.last_reset_at AS last_reset_at,
      lres.resolved_at AS resolved_at,
      (
        lres.resolved_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM recent_entries re2
          WHERE re2.reset_key = cr.reset_key
            AND re2.event_at > lres.resolved_at
        )
      ) AS is_resolved,
      MIN(rc.comment) AS comment,
      COUNT(re.event_at) FILTER (
        WHERE re.event_at >= GREATEST(
          COALESCE(lr.last_reset_at, 'epoch'::timestamptz),
          CAST(:now AS timestamptz) - INTERVAL '1 day'
        )
      )::int AS count_1d,
      COUNT(re.event_at) FILTER (
        WHERE re.event_at >= GREATEST(
          COALESCE(lr.last_reset_at, 'epoch'::timestamptz),
          CAST(:now AS timestamptz) - INTERVAL '3 days'
        )
      )::int AS count_3d,
      COUNT(re.event_at) FILTER (
        WHERE re.event_at >= GREATEST(
          COALESCE(lr.last_reset_at, 'epoch'::timestamptz),
          CAST(:now AS timestamptz) - INTERVAL '30 days'
        )
      )::int AS count_30d,
      COUNT(re.event_at) FILTER (
        WHERE re.event_at >= GREATEST(
          COALESCE(lr.last_reset_at, 'epoch'::timestamptz),
          CAST(:now AS timestamptz) - INTERVAL '90 days'
        )
      )::int AS count_90d
    FROM candidate_rows cr
    LEFT JOIN latest_resets lr ON lr.reset_key = cr.reset_key
    LEFT JOIN latest_resolutions lres ON lres.row_key = cr.reset_key
    LEFT JOIN recent_entries re ON re.reset_key = cr.reset_key
    LEFT JOIN row_comments rc
      ON rc.dimension = :dimension
      AND rc.row_key = cr.reset_key
      AND rc.deleted_at IS NULL
    GROUP BY cr.reset_key, lr.last_reset_at, lres.resolved_at
    ORDER BY count_90d DESC, count_30d DESC, count_3d DESC, count_1d DESC, label ASC
  `;
}

function buildSeriesQuery(dimension) {
  const config = DIMENSIONS[dimension];
  if (!config) {
    throw createHttpError(400, 'Unsupported analytics dimension');
  }

  const medicineIdExpression = `NULLIF(BTRIM(tme.medicine_id), '')`;
  const dimensionFilter = buildNonIgnoredDimensionCondition(dimension, config.keyExpression);

  return `
    WITH selected_keys AS (
      SELECT DISTINCT reset_key
      FROM UNNEST(ARRAY[:keys]::text[]) AS selected_value(reset_key)
    ),
    recent_entries AS (
      SELECT
        tm.message_date AS event_at,
        ${config.keyExpression} AS reset_key,
        ${config.labelExpression} AS label,
        ${medicineIdExpression} AS medicine_id
      FROM telegram_messages tm
      JOIN telegram_medicine_entries tme ON tme.message_id = tm.id
      WHERE tm.message_date >= CAST(:seriesStart AS timestamptz)
        AND ${config.keyExpression} IS NOT NULL
        AND ${config.keyExpression} = ANY(ARRAY[:keys]::text[])
        AND ${buildNonIgnoredSourceTextCondition('tme')}
        AND ${dimensionFilter}

      UNION ALL

      SELECT
        tme.created_at AS event_at,
        ${config.keyExpression} AS reset_key,
        ${config.labelExpression} AS label,
        ${medicineIdExpression} AS medicine_id
      FROM telegram_messages tm
      JOIN telegram_medicine_entries tme ON tme.message_id = tm.id
      WHERE tm.message_date IS NULL
        AND tme.created_at >= CAST(:seriesStart AS timestamptz)
        AND ${config.keyExpression} IS NOT NULL
        AND ${config.keyExpression} = ANY(ARRAY[:keys]::text[])
        AND ${buildNonIgnoredSourceTextCondition('tme')}
        AND ${dimensionFilter}
    ),
    latest_resets AS (
      SELECT DISTINCT ON (rp.reset_key)
        rp.reset_key,
        rp.reset_at AS last_reset_at
      FROM reset_points rp
      WHERE rp.dimension = :dimension
        AND rp.reset_key = ANY(ARRAY[:keys]::text[])
      ORDER BY rp.reset_key, rp.reset_at DESC, rp.created_at DESC, rp.id DESC
    ),
    labels AS (
      SELECT
        sk.reset_key,
        COALESCE(MIN(re.label), sk.reset_key) AS label,
        MIN(re.medicine_id) AS medicine_id,
        lr.last_reset_at
      FROM selected_keys sk
      LEFT JOIN recent_entries re ON re.reset_key = sk.reset_key
      LEFT JOIN latest_resets lr ON lr.reset_key = sk.reset_key
      GROUP BY sk.reset_key, lr.last_reset_at
    ),
    day_series AS (
      SELECT generate_series(
        CAST(:seriesStart AS date),
        CAST(:seriesEnd AS date),
        INTERVAL '1 day'
      )::date AS day
    ),
    daily_counts AS (
      SELECT
        re.reset_key,
        CAST(re.event_at AS date) AS day,
        COUNT(*)::int AS daily_count
      FROM recent_entries re
      LEFT JOIN latest_resets lr ON lr.reset_key = re.reset_key
      WHERE re.reset_key IN (SELECT reset_key FROM selected_keys)
        AND re.event_at >= GREATEST(
          COALESCE(lr.last_reset_at, 'epoch'::timestamptz),
          CAST(:seriesStart AS timestamptz)
        )
      GROUP BY re.reset_key, CAST(re.event_at AS date)
    )
    SELECT
      labels.reset_key AS key,
      labels.label AS label,
      CASE
        WHEN :dimension = 'medicine_id' THEN labels.reset_key
        ELSE labels.medicine_id
      END AS medicine_id,
      labels.last_reset_at AS last_reset_at,
      day_series.day AS day,
      COALESCE(daily_counts.daily_count, 0)::int AS daily_count
    FROM labels
    CROSS JOIN day_series
    LEFT JOIN daily_counts
      ON daily_counts.reset_key = labels.reset_key
      AND daily_counts.day = day_series.day
    ORDER BY labels.label ASC, day_series.day ASC
  `;
}

function buildIgnoredTextQuery() {
  return `
    WITH recent_matches AS (
      SELECT
        tm.message_date AS event_at,
        NULLIF(BTRIM(tme.source_text), '') AS source_text
      FROM telegram_messages tm
      JOIN telegram_medicine_entries tme ON tme.message_id = tm.id
      WHERE tm.message_date >= CAST(:windowStart AS timestamptz)
        AND NULLIF(BTRIM(tme.source_text), '') IS NOT NULL

      UNION ALL

      SELECT
        tme.created_at AS event_at,
        NULLIF(BTRIM(tme.source_text), '') AS source_text
      FROM telegram_messages tm
      JOIN telegram_medicine_entries tme ON tme.message_id = tm.id
      WHERE tm.message_date IS NULL
        AND tme.created_at >= CAST(:windowStart AS timestamptz)
        AND NULLIF(BTRIM(tme.source_text), '') IS NOT NULL
    )
    SELECT
      ist.source_text AS key,
      ist.source_text AS label,
      ist.created_at AS ignored_at,
      COUNT(rm.event_at) FILTER (
        WHERE rm.event_at >= CAST(:now AS timestamptz) - INTERVAL '90 days'
      )::int AS count_90d
    FROM ignored_source_texts ist
    LEFT JOIN recent_matches rm ON rm.source_text = ist.source_text
    GROUP BY ist.id, ist.source_text, ist.created_at
    ORDER BY ist.created_at DESC, ist.source_text ASC
  `;
}

const UNDO_WINDOW_MS = 30 * 60 * 1000;

function mapDimensionRow(row, activeNow) {
  const lastResetAt = row.last_reset_at ? new Date(row.last_reset_at) : null;
  const withinUndoWindow =
    lastResetAt && activeNow
      ? activeNow.getTime() - lastResetAt.getTime() <= UNDO_WINDOW_MS
      : Boolean(lastResetAt);
  const resolvedAt = row.resolved_at ? new Date(row.resolved_at) : null;

  return {
    key: row.key,
    label: row.label || row.key,
    medicineId: row.medicine_id || null,
    count1d: Number(row.count_1d || 0),
    count3d: Number(row.count_3d || 0),
    count30d: Number(row.count_30d || 0),
    count90d: Number(row.count_90d || 0),
    lastResetAt: lastResetAt ? lastResetAt.toISOString() : null,
    canUndoLastReset: Boolean(withinUndoWindow),
    comment: row.comment || null,
    isResolved: Boolean(row.is_resolved),
    resolvedAt: resolvedAt ? resolvedAt.toISOString() : null,
  };
}

function mapIgnoredTextRow(row) {
  return {
    key: row.key,
    label: row.label || row.key,
    ignoredAt: row.ignored_at ? new Date(row.ignored_at).toISOString() : null,
    count90d: Number(row.count_90d || 0),
  };
}

function toIsoDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'string') {
    return value.includes('T') ? value.slice(0, 10) : value;
  }

  return null;
}

function createMedicineAnalyticsService({ models, now = () => new Date() } = {}) {
  if (!models || !models.sequelize) {
    throw new Error('createMedicineAnalyticsService requires models with sequelize');
  }

  const {
    sequelize,
    ResetPoint,
    IgnoredSourceText,
    IgnoredDimensionValue,
    RowComment,
    RowResolution,
  } = models;

  if (!ResetPoint) {
    throw new Error('createMedicineAnalyticsService requires ResetPoint');
  }

  if (!IgnoredSourceText) {
    throw new Error('createMedicineAnalyticsService requires IgnoredSourceText');
  }

  if (!IgnoredDimensionValue) {
    throw new Error('createMedicineAnalyticsService requires IgnoredDimensionValue');
  }

  if (!RowComment) {
    throw new Error('createMedicineAnalyticsService requires RowComment');
  }

  if (!RowResolution) {
    throw new Error('createMedicineAnalyticsService requires RowResolution');
  }

  function resolveNow(nowValue) {
    return nowValue ? resolveDate(nowValue) : resolveDate(now());
  }

  async function getDimensionRows(dimension, { nowValue } = {}) {
    if (!DIMENSIONS[dimension]) {
      throw createHttpError(400, 'Unsupported analytics dimension');
    }

    const activeNow = resolveNow(nowValue);
    const windowStart = new Date(activeNow.getTime() - 90 * 24 * 60 * 60 * 1000);
    const rows = await sequelize.query(buildDimensionQuery(dimension), {
      replacements: {
        dimension,
        now: activeNow.toISOString(),
        windowStart: windowStart.toISOString(),
      },
      type: QueryTypes.SELECT,
    });

    return rows.map((row) => mapDimensionRow(row, activeNow));
  }

  async function getDimensionRow(dimension, resetKey, { nowValue } = {}) {
    const normalizedKey = normalizeResetKey(dimension, resetKey);
    const rows = await getDimensionRows(dimension, { nowValue });
    return rows.find((row) => row.key === normalizedKey) || null;
  }

  async function getAnalytics({ nowValue } = {}) {
    const activeNow = resolveNow(nowValue);
    const [name, tradeName, medicineId] = await Promise.all([
      getDimensionRows('name', { nowValue: activeNow }),
      getDimensionRows('trade_name', { nowValue: activeNow }),
      getDimensionRows('medicine_id', { nowValue: activeNow }),
    ]);

    return {
      generatedAt: activeNow.toISOString(),
      name,
      tradeName,
      medicineId,
    };
  }

  async function getSeries({ dimension, keys, nowValue } = {}) {
    if (!DIMENSIONS[dimension]) {
      throw createHttpError(400, 'Unsupported analytics dimension');
    }

    const normalizedKeys = Array.from(
      new Set(
        (Array.isArray(keys) ? keys : [keys])
          .filter((value) => value !== undefined && value !== null && value !== '')
          .map((value) => normalizeResetKey(dimension, value)),
      ),
    );

    const activeNow = resolveNow(nowValue);
    const seriesEnd = startOfUtcDay(activeNow);
    const seriesStart = addUtcDays(seriesEnd, -89);

    if (!normalizedKeys.length) {
      return {
        generatedAt: activeNow.toISOString(),
        dimension: toPayloadKey(dimension),
        startDate: seriesStart.toISOString().slice(0, 10),
        endDate: seriesEnd.toISOString().slice(0, 10),
        series: [],
      };
    }

    const rows = await sequelize.query(buildSeriesQuery(dimension), {
      replacements: {
        dimension,
        keys: normalizedKeys,
        seriesStart: seriesStart.toISOString(),
        seriesEnd: seriesEnd.toISOString(),
      },
      type: QueryTypes.SELECT,
    });

    const seriesByKey = new Map();

    rows.forEach((row) => {
      if (!seriesByKey.has(row.key)) {
        seriesByKey.set(row.key, {
          key: row.key,
          label: row.label || row.key,
          medicineId: row.medicine_id || null,
          lastResetAt: row.last_reset_at ? new Date(row.last_reset_at).toISOString() : null,
          points: [],
        });
      }

      seriesByKey.get(row.key).points.push({
        date: toIsoDate(row.day),
        count: Number(row.daily_count || 0),
      });
    });

    return {
      generatedAt: activeNow.toISOString(),
      dimension: toPayloadKey(dimension),
      startDate: seriesStart.toISOString().slice(0, 10),
      endDate: seriesEnd.toISOString().slice(0, 10),
      series: Array.from(seriesByKey.values()),
    };
  }

  async function getIgnoredDimensionValues() {
    const records = await IgnoredDimensionValue.findAll({
      order: [['created_at', 'DESC']],
    });

    return records.map((record) => ({
      id: record.id,
      kind: 'dimensionValue',
      dimension: toPayloadKey(record.dimension),
      internalDimension: record.dimension,
      key: record.key,
      label: record.key,
      ignoredAt:
        record.created_at instanceof Date
          ? record.created_at.toISOString()
          : record.created_at,
    }));
  }

  async function getIgnoredTexts({ nowValue } = {}) {
    const activeNow = resolveNow(nowValue);
    const windowStart = new Date(activeNow.getTime() - 90 * 24 * 60 * 60 * 1000);
    const sourceTextRows = await sequelize.query(buildIgnoredTextQuery(), {
      replacements: {
        now: activeNow.toISOString(),
        windowStart: windowStart.toISOString(),
      },
      type: QueryTypes.SELECT,
    });

    const sourceTexts = sourceTextRows.map((row) => ({
      ...mapIgnoredTextRow(row),
      kind: 'sourceText',
    }));

    const dimensionValues = await getIgnoredDimensionValues();

    return {
      generatedAt: activeNow.toISOString(),
      rows: [...dimensionValues, ...sourceTexts],
    };
  }

  async function ignoreSourceText({ sourceText, nowValue } = {}) {
    const normalizedSourceText = normalizeIgnoredSourceText(sourceText);
    const activeNow = resolveNow(nowValue);
    const [ignoredText, created] = await IgnoredSourceText.findOrCreate({
      where: {
        source_text: normalizedSourceText,
      },
      defaults: {
        source_text: normalizedSourceText,
      },
    });

    return {
      generatedAt: activeNow.toISOString(),
      created,
      ignoredText: serializeIgnoredText(ignoredText),
      rows: (await getIgnoredTexts({ nowValue: activeNow })).rows,
    };
  }

  async function ignoreDimensionValue({ dimension, key, nowValue } = {}) {
    const internalDimension = fromPayloadKey(dimension);
    if (!internalDimension || !DIMENSIONS[internalDimension]) {
      throw createHttpError(400, 'Unsupported analytics dimension');
    }

    const normalizedKey = normalizeResetKey(internalDimension, key);
    const activeNow = resolveNow(nowValue);

    const [record, created] = await IgnoredDimensionValue.findOrCreate({
      where: {
        dimension: internalDimension,
        key: normalizedKey,
      },
      defaults: {
        dimension: internalDimension,
        key: normalizedKey,
      },
    });

    return {
      generatedAt: activeNow.toISOString(),
      created,
      ignoredDimensionValue: {
        id: record.id,
        dimension: toPayloadKey(internalDimension),
        key: normalizedKey,
      },
      rows: (await getIgnoredTexts({ nowValue: activeNow })).rows,
    };
  }

  async function restoreIgnoredDimensionValue({ dimension, key, nowValue } = {}) {
    const internalDimension = fromPayloadKey(dimension);
    if (!internalDimension || !DIMENSIONS[internalDimension]) {
      throw createHttpError(400, 'Unsupported analytics dimension');
    }

    const normalizedKey = normalizeResetKey(internalDimension, key);
    const activeNow = resolveNow(nowValue);

    const record = await IgnoredDimensionValue.findOne({
      where: {
        dimension: internalDimension,
        key: normalizedKey,
      },
    });

    if (!record) {
      throw createHttpError(404, 'No ignored dimension value found');
    }

    await record.destroy();

    return {
      generatedAt: activeNow.toISOString(),
      restoredDimensionValue: {
        dimension: toPayloadKey(internalDimension),
        key: normalizedKey,
      },
      rows: (await getIgnoredTexts({ nowValue: activeNow })).rows,
    };
  }

  async function restoreIgnoredSourceText({ sourceText, nowValue } = {}) {
    const normalizedSourceText = normalizeIgnoredSourceText(sourceText);
    const activeNow = resolveNow(nowValue);
    const ignoredText = await IgnoredSourceText.findOne({
      where: {
        source_text: normalizedSourceText,
      },
    });

    if (!ignoredText) {
      throw createHttpError(404, 'No ignored text found for this captured text');
    }

    const restoredText = serializeIgnoredText(ignoredText);
    await ignoredText.destroy();

    return {
      generatedAt: activeNow.toISOString(),
      restoredText,
      rows: (await getIgnoredTexts({ nowValue: activeNow })).rows,
    };
  }

  function normalizeCommentText(value) {
    if (typeof value !== 'string') {
      throw createHttpError(400, 'comment is required');
    }

    const trimmed = value.trim();
    if (!trimmed) {
      throw createHttpError(400, 'comment is required');
    }

    if (trimmed.length > COMMENT_MAX_LENGTH) {
      throw createHttpError(400, `comment must be at most ${COMMENT_MAX_LENGTH} characters`);
    }

    return trimmed;
  }

  async function setRowComment({ dimension, resetKey, comment, nowValue } = {}) {
    if (!DIMENSIONS[dimension]) {
      throw createHttpError(400, 'Unsupported analytics dimension');
    }

    const normalizedKey = normalizeResetKey(dimension, resetKey);
    const normalizedComment = normalizeCommentText(comment);
    const activeNow = resolveNow(nowValue);

    const record = await sequelize.transaction(async (transaction) => {
      const existing = await RowComment.findOne({
        where: {
          dimension,
          row_key: normalizedKey,
          deleted_at: null,
        },
        transaction,
      });

      if (existing) {
        existing.comment = normalizedComment;
        await existing.save({ transaction });
        return existing;
      }

      return RowComment.create(
        {
          dimension,
          row_key: normalizedKey,
          comment: normalizedComment,
        },
        { transaction },
      );
    });

    return {
      generatedAt: activeNow.toISOString(),
      dimension: toPayloadKey(dimension),
      comment: {
        id: record.id,
        dimension: toPayloadKey(dimension),
        resetKey: normalizedKey,
        text: record.comment,
      },
      row: await getDimensionRow(dimension, normalizedKey, { nowValue: activeNow }),
    };
  }

  async function deleteRowComment({ dimension, resetKey, nowValue } = {}) {
    if (!DIMENSIONS[dimension]) {
      throw createHttpError(400, 'Unsupported analytics dimension');
    }

    const normalizedKey = normalizeResetKey(dimension, resetKey);
    const activeNow = resolveNow(nowValue);

    const existing = await RowComment.findOne({
      where: {
        dimension,
        row_key: normalizedKey,
        deleted_at: null,
      },
    });

    if (!existing) {
      throw createHttpError(404, 'No comment found for this row');
    }

    await existing.destroy();

    return {
      generatedAt: activeNow.toISOString(),
      dimension: toPayloadKey(dimension),
      row: await getDimensionRow(dimension, normalizedKey, { nowValue: activeNow }),
    };
  }

  async function resolveRow({ dimension, resetKey, nowValue } = {}) {
    if (!DIMENSIONS[dimension]) {
      throw createHttpError(400, 'Unsupported analytics dimension');
    }

    const normalizedKey = normalizeResetKey(dimension, resetKey);
    const activeNow = resolveNow(nowValue);

    const record = await sequelize.transaction(async (transaction) => {
      const existing = await RowResolution.findOne({
        where: {
          dimension,
          row_key: normalizedKey,
          deleted_at: null,
        },
        transaction,
      });

      if (existing) {
        existing.resolved_at = activeNow;
        await existing.save({ transaction });
        return existing;
      }

      return RowResolution.create(
        {
          dimension,
          row_key: normalizedKey,
          resolved_at: activeNow,
        },
        { transaction },
      );
    });

    return {
      generatedAt: activeNow.toISOString(),
      dimension: toPayloadKey(dimension),
      resolution: {
        id: record.id,
        dimension: toPayloadKey(dimension),
        resetKey: normalizedKey,
        resolvedAt:
          record.resolved_at instanceof Date
            ? record.resolved_at.toISOString()
            : record.resolved_at,
      },
      row: await getDimensionRow(dimension, normalizedKey, { nowValue: activeNow }),
    };
  }

  async function unresolveRow({ dimension, resetKey, nowValue } = {}) {
    if (!DIMENSIONS[dimension]) {
      throw createHttpError(400, 'Unsupported analytics dimension');
    }

    const normalizedKey = normalizeResetKey(dimension, resetKey);
    const activeNow = resolveNow(nowValue);

    const existing = await RowResolution.findOne({
      where: {
        dimension,
        row_key: normalizedKey,
        deleted_at: null,
      },
    });

    if (!existing) {
      throw createHttpError(404, 'No resolution found for this row');
    }

    await existing.destroy();

    return {
      generatedAt: activeNow.toISOString(),
      dimension: toPayloadKey(dimension),
      row: await getDimensionRow(dimension, normalizedKey, { nowValue: activeNow }),
    };
  }

  async function createResetPoint({ dimension, resetKey, nowValue } = {}) {
    if (!DIMENSIONS[dimension]) {
      throw createHttpError(400, 'Unsupported analytics dimension');
    }

    const normalizedKey = normalizeResetKey(dimension, resetKey);
    const activeNow = resolveNow(nowValue);

    const resetPoint = await sequelize.transaction(async (transaction) => {
      const created = await ResetPoint.create(
        {
          dimension,
          reset_key: normalizedKey,
          reset_at: activeNow,
        },
        { transaction },
      );

      await RowComment.update(
        { deleted_at: activeNow },
        {
          where: {
            dimension,
            row_key: normalizedKey,
            deleted_at: null,
          },
          transaction,
        },
      );

      return created;
    });

    return {
      generatedAt: activeNow.toISOString(),
      dimension: toPayloadKey(dimension),
      resetPoint: serializeResetPoint(resetPoint),
      row: await getDimensionRow(dimension, normalizedKey, { nowValue: activeNow }),
    };
  }

  async function undoLatestResetPoint({ dimension, resetKey, nowValue } = {}) {
    if (!DIMENSIONS[dimension]) {
      throw createHttpError(400, 'Unsupported analytics dimension');
    }

    const normalizedKey = normalizeResetKey(dimension, resetKey);
    const activeNow = resolveNow(nowValue);

    const resetPoint = await ResetPoint.findOne({
      where: {
        dimension,
        reset_key: normalizedKey,
      },
      order: [
        ['reset_at', 'DESC'],
        ['created_at', 'DESC'],
        ['id', 'DESC'],
      ],
    });

    if (!resetPoint) {
      throw createHttpError(404, 'No reset point found for this medicine row');
    }

    const createdAt = resetPoint.reset_at instanceof Date
      ? resetPoint.reset_at
      : new Date(resetPoint.reset_at);
    if (activeNow.getTime() - createdAt.getTime() > UNDO_WINDOW_MS) {
      throw createHttpError(410, 'Reset point can only be undone within 30 minutes of creation');
    }

    const deletedResetPoint = serializeResetPoint(resetPoint);

    await sequelize.transaction(async (transaction) => {
      await resetPoint.destroy({ transaction });

      const toleranceStart = new Date(createdAt.getTime() - COMMENT_UNDO_MATCH_TOLERANCE_MS);
      const toleranceEnd = new Date(createdAt.getTime() + COMMENT_UNDO_MATCH_TOLERANCE_MS);

      const candidate = await RowComment.findOne({
        where: {
          dimension,
          row_key: normalizedKey,
          deleted_at: { [Op.between]: [toleranceStart, toleranceEnd] },
        },
        order: [['deleted_at', 'DESC']],
        transaction,
      });

      if (candidate) {
        const conflicting = await RowComment.findOne({
          where: {
            dimension,
            row_key: normalizedKey,
            deleted_at: null,
          },
          transaction,
        });
        if (!conflicting) {
          candidate.deleted_at = null;
          await candidate.save({ transaction });
        }
      }
    });

    return {
      generatedAt: activeNow.toISOString(),
      dimension: toPayloadKey(dimension),
      deletedResetPoint,
      row: await getDimensionRow(dimension, normalizedKey, { nowValue: activeNow }),
    };
  }

  return {
    getAnalytics,
    getSeries,
    getIgnoredTexts,
    ignoreSourceText,
    restoreIgnoredSourceText,
    ignoreDimensionValue,
    restoreIgnoredDimensionValue,
    createResetPoint,
    undoLatestResetPoint,
    setRowComment,
    deleteRowComment,
    resolveRow,
    unresolveRow,
  };
}

module.exports = {
  createMedicineAnalyticsService,
};
