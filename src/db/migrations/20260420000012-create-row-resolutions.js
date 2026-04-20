'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('row_resolutions', {
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
      row_key: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      resolved_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
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

    await queryInterface.addIndex('row_resolutions', ['dimension', 'row_key'], {
      name: 'row_resolutions_active_dimension_key_unique',
      unique: true,
      where: { deleted_at: null },
    });

    await queryInterface.addIndex('row_resolutions', ['dimension', 'row_key', 'deleted_at'], {
      name: 'row_resolutions_dimension_key_deleted_at_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('row_resolutions');
  },
};
