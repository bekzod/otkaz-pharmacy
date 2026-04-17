'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('reset_points', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      dimension: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      reset_key: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      reset_at: {
        type: Sequelize.DATE,
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

    await queryInterface.addIndex('reset_points', ['dimension', 'reset_key', 'reset_at'], {
      name: 'reset_points_dimension_key_reset_at_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('reset_points');
  },
};
