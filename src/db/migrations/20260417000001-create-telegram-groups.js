'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('telegram_groups', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      title: {
        type: Sequelize.STRING,
      },
      link: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      disabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      last_crawled_message_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      crawled_date: {
        type: Sequelize.DATE,
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('telegram_groups');
  },
};
