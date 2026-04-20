const { DataTypes } = require('sequelize');
const sequelize = require('..');

const RowResolution = sequelize.define(
  'RowResolution',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    dimension: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    row_key: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    resolved_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'row_resolutions',
    underscored: true,
    indexes: [
      {
        name: 'row_resolutions_active_dimension_key_unique',
        unique: true,
        fields: ['dimension', 'row_key'],
        where: { deleted_at: null },
      },
      {
        name: 'row_resolutions_dimension_key_deleted_at_idx',
        fields: ['dimension', 'row_key', 'deleted_at'],
      },
    ],
  },
);

module.exports = RowResolution;
