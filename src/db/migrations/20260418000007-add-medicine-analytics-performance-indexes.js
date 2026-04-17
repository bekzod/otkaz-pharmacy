'use strict';

const NAME_KEY_EXPRESSION = `
  LOWER(
    COALESCE(
      NULLIF(BTRIM(parser_result->>'name'), ''),
      NULLIF(BTRIM(parser_result->>'normalized_query'), ''),
      NULLIF(BTRIM(source_text), '')
    )
  )
`;

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

const MEDICINE_ID_KEY_EXPRESSION = `NULLIF(BTRIM(medicine_id), '')`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS telegram_messages_message_date_idx
    `);

    await queryInterface.addIndex('telegram_messages', ['message_date', 'id'], {
      name: 'telegram_messages_message_date_id_idx',
    });

    await queryInterface.addIndex('telegram_medicine_entries', ['created_at', 'message_id'], {
      name: 'telegram_medicine_entries_created_at_message_id_idx',
    });

    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS reset_points_dimension_key_reset_at_idx
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX reset_points_dimension_key_latest_idx
      ON reset_points (dimension, reset_key, reset_at DESC, created_at DESC, id DESC)
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX telegram_medicine_entries_name_analytics_key_idx
      ON telegram_medicine_entries ((${NAME_KEY_EXPRESSION}), created_at, message_id)
      WHERE ${NAME_KEY_EXPRESSION} IS NOT NULL
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX telegram_medicine_entries_trade_name_analytics_key_idx
      ON telegram_medicine_entries ((${TRADE_NAME_KEY_EXPRESSION}), created_at, message_id)
      WHERE ${TRADE_NAME_KEY_EXPRESSION} IS NOT NULL
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX telegram_medicine_entries_medicine_id_analytics_key_idx
      ON telegram_medicine_entries ((${MEDICINE_ID_KEY_EXPRESSION}), created_at, message_id)
      WHERE ${MEDICINE_ID_KEY_EXPRESSION} IS NOT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS telegram_medicine_entries_medicine_id_analytics_key_idx
    `);
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS telegram_medicine_entries_trade_name_analytics_key_idx
    `);
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS telegram_medicine_entries_name_analytics_key_idx
    `);
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS reset_points_dimension_key_latest_idx
    `);

    await queryInterface.addIndex('reset_points', ['dimension', 'reset_key', 'reset_at'], {
      name: 'reset_points_dimension_key_reset_at_idx',
    });

    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS telegram_medicine_entries_created_at_message_id_idx
    `);
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS telegram_messages_message_date_id_idx
    `);

    await queryInterface.addIndex('telegram_messages', ['message_date'], {
      name: 'telegram_messages_message_date_idx',
    });
  },
};
