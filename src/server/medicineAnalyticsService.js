const { QueryTypes } = require('sequelize');

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
          NULLIF(BTRIM(tme.parser_result->>'name'), ''),
          NULLIF(BTRIM(tme.parser_result->>'normalized_query'), ''),
          NULLIF(BTRIM(tme.source_text), '')
        )
      )
    `,
    labelExpression: `
      COALESCE(
        NULLIF(BTRIM(tme.parser_result->>'trade_name'), ''),
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
        NULLIF(BTRIM(tme.parser_result->>'name'), ''),
        NULLIF(BTRIM(tme.parser_result->>'normalized_query'), ''),
        NULLIF(BTRIM(tme.source_text), ''),
        NULLIF(BTRIM(tme.medicine_id), '')
      )
    `,
  },
});

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

function toPayloadKey(dimension) {
  if (dimension === 'trade_name') return 'tradeName';
  if (dimension === 'medicine_id') return 'medicineId';
  return 'name';
}

function buildDimensionQuery(dimension) {
  const config = DIMENSIONS[dimension];
  if (!config) {
    throw createHttpError(400, 'Unsupported analytics dimension');
  }

  const medicineIdExpression = `NULLIF(BTRIM(tme.medicine_id), '')`;

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
    ),
    latest_resets AS (
      SELECT DISTINCT ON (rp.reset_key)
        rp.reset_key,
        rp.reset_at AS last_reset_at
      FROM reset_points rp
      WHERE rp.dimension = :dimension
      ORDER BY rp.reset_key, rp.reset_at DESC, rp.created_at DESC, rp.id DESC
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
    LEFT JOIN recent_entries re ON re.reset_key = cr.reset_key
    GROUP BY cr.reset_key, lr.last_reset_at
    ORDER BY count_90d DESC, count_30d DESC, count_3d DESC, count_1d DESC, label ASC
  `;
}

function buildSeriesQuery(dimension) {
  const config = DIMENSIONS[dimension];
  if (!config) {
    throw createHttpError(400, 'Unsupported analytics dimension');
  }

  const medicineIdExpression = `NULLIF(BTRIM(tme.medicine_id), '')`;

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

function mapDimensionRow(row) {
  return {
    key: row.key,
    label: row.label || row.key,
    medicineId: row.medicine_id || null,
    count1d: Number(row.count_1d || 0),
    count3d: Number(row.count_3d || 0),
    count30d: Number(row.count_30d || 0),
    count90d: Number(row.count_90d || 0),
    lastResetAt: row.last_reset_at ? new Date(row.last_reset_at).toISOString() : null,
    canUndoLastReset: Boolean(row.last_reset_at),
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

  const { sequelize, ResetPoint } = models;

  if (!ResetPoint) {
    throw new Error('createMedicineAnalyticsService requires ResetPoint');
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

    return rows.map(mapDimensionRow);
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

  async function createResetPoint({ dimension, resetKey, nowValue } = {}) {
    if (!DIMENSIONS[dimension]) {
      throw createHttpError(400, 'Unsupported analytics dimension');
    }

    const normalizedKey = normalizeResetKey(dimension, resetKey);
    const activeNow = resolveNow(nowValue);

    const resetPoint = await ResetPoint.create({
      dimension,
      reset_key: normalizedKey,
      reset_at: activeNow,
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

    const deletedResetPoint = serializeResetPoint(resetPoint);
    await resetPoint.destroy();

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
    createResetPoint,
    undoLatestResetPoint,
  };
}

module.exports = {
  createMedicineAnalyticsService,
};
