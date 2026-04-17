'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('telegram_messages', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      group_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'telegram_groups', key: 'id' },
        onDelete: 'CASCADE',
      },
      message_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
      },
      message_date: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      text: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      sender_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      sender_username: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      has_media: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      media_type: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      raw: {
        type: Sequelize.JSONB,
        allowNull: true,
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

    await queryInterface.addIndex('telegram_messages', ['group_id', 'message_id'], {
      unique: true,
      name: 'telegram_messages_group_id_message_id_unique',
    });

    await queryInterface.addIndex('telegram_messages', ['message_date'], {
      name: 'telegram_messages_message_date_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('telegram_messages');
  },
};
