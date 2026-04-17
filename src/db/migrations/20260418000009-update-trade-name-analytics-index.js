'use strict';

const TRADE_NAME_KEY_EXPRESSION = `
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

const LEGACY_TRADE_NAME_KEY_EXPRESSION = `
  LOWER(
    COALESCE(
      NULLIF(BTRIM(parser_result->>'trade_name'), ''),
      NULLIF(BTRIM(parser_result->>'name'), ''),
      NULLIF(BTRIM(parser_result->>'normalized_query'), ''),
      NULLIF(BTRIM(source_text), '')
    )
  )
`;

module.exports = {
  async up(queryInterface) {
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
