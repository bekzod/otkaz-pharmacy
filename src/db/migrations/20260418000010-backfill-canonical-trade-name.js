'use strict';

const { QueryTypes } = require('sequelize');
const { parseMedicineQuery } = require('../../common/parser');

const BATCH_SIZE = 500;

const TRADE_NAME_KEY_EXPRESSION = `
  LOWER(
    COALESCE(
      NULLIF(BTRIM(parser_result->>'trade_name'), ''),
      NULLIF(BTRIM(parser_result->'attributes'->>'trade_name_text'), ''),
      NULLIF(BTRIM(parser_result->>'name'), ''),
      NULLIF(BTRIM(parser_result->>'normalized_query'), ''),
      NULLIF(BTRIM(source_text), '')
    )
  )
`;

const LEGACY_TRADE_NAME_KEY_EXPRESSION = `
  LOWER(
    COALESCE(
      NULLIF(BTRIM(parser_result->'attributes'->>'trade_name_text'), ''),
      NULLIF(BTRIM(parser_result->>'trade_name'), ''),
      NULLIF(BTRIM(parser_result->>'name'), ''),
      NULLIF(BTRIM(parser_result->>'normalized_query'), ''),
      NULLIF(BTRIM(source_text), '')
    )
  )
`;

async function backfillCanonicalTradeNames(sequelize) {
  let offset = 0;

  for (;;) {
    const rows = await sequelize.query(
      `
        SELECT id, source_text, parser_result
        FROM telegram_medicine_entries
        WHERE parser_result IS NOT NULL
        ORDER BY created_at ASC, id ASC
        LIMIT :limit
        OFFSET :offset
      `,
      {
        replacements: { limit: BATCH_SIZE, offset },
        type: QueryTypes.SELECT,
      },
    );

    if (!rows.length) break;

    for (const row of rows) {
      const sourceText =
        (typeof row.source_text === 'string' && row.source_text.trim()) ||
        row.parser_result?.rawQuery ||
        row.parser_result?.normalizedText ||
        '';

      if (!sourceText) continue;

      const canonicalTradeName = parseMedicineQuery(sourceText)?.trade_name || null;
      if (!canonicalTradeName) continue;

      const currentTradeName =
        typeof row.parser_result?.trade_name === 'string'
          ? row.parser_result.trade_name.trim()
          : '';

      if (currentTradeName === canonicalTradeName) continue;

      await sequelize.query(
        `
          UPDATE telegram_medicine_entries
          SET parser_result = CAST(:parserResult AS jsonb),
              updated_at = NOW()
          WHERE id = :id
        `,
        {
          replacements: {
            id: row.id,
            parserResult: JSON.stringify({
              ...row.parser_result,
              trade_name: canonicalTradeName,
            }),
          },
        },
      );
    }

    offset += rows.length;
  }
}

module.exports = {
  async up(queryInterface) {
    await backfillCanonicalTradeNames(queryInterface.sequelize);

    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS telegram_medicine_entries_trade_name_analytics_key_idx
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX telegram_medicine_entries_trade_name_analytics_key_idx
      ON telegram_medicine_entries ((${TRADE_NAME_KEY_EXPRESSION}), created_at, message_id)
      WHERE ${TRADE_NAME_KEY_EXPRESSION} IS NOT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS telegram_medicine_entries_trade_name_analytics_key_idx
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX telegram_medicine_entries_trade_name_analytics_key_idx
      ON telegram_medicine_entries ((${LEGACY_TRADE_NAME_KEY_EXPRESSION}), created_at, message_id)
      WHERE ${LEGACY_TRADE_NAME_KEY_EXPRESSION} IS NOT NULL
    `);
  },
};
