'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('telegram_medicine_entries', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      message_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'telegram_messages', key: 'id' },
        onDelete: 'CASCADE',
      },
      message_image_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'telegram_message_images', key: 'id' },
        onDelete: 'CASCADE',
      },
      source_type: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      source_index: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      source_text: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      medicine_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      parser_result: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      resolver_status: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex('telegram_medicine_entries', ['message_id'], {
      name: 'telegram_medicine_entries_message_id_idx',
    });

    await queryInterface.addIndex('telegram_medicine_entries', ['message_image_id'], {
      name: 'telegram_medicine_entries_message_image_id_idx',
    });

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX telegram_medicine_entries_message_text_unique
      ON telegram_medicine_entries (message_id, source_type, source_index)
      WHERE message_image_id IS NULL
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX telegram_medicine_entries_image_line_unique
      ON telegram_medicine_entries (message_image_id, source_type, source_index)
      WHERE message_image_id IS NOT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('telegram_medicine_entries');
  },
};
