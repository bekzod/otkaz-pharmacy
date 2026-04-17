'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ignored_dimension_values', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.UUIDV4,
      },
      dimension: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      key: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('ignored_dimension_values', ['dimension', 'key'], {
      name: 'ignored_dimension_values_dimension_key_unique',
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ignored_dimension_values');
  },
};
