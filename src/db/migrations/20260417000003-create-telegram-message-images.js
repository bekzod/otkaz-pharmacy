'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('telegram_message_images', {
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
      telegram_photo_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      mime_type: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      file_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      width: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      height: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      size_bytes: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      data: {
        type: Sequelize.BLOB('long'),
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

    await queryInterface.addIndex('telegram_message_images', ['message_id'], {
      name: 'telegram_message_images_message_id_idx',
    });

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX telegram_message_images_message_photo_unique
      ON telegram_message_images (message_id, telegram_photo_id)
      WHERE telegram_photo_id IS NOT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('telegram_message_images');
  },
};
