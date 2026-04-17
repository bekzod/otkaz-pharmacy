const { DataTypes } = require('sequelize');
const sequelize = require('..');

const IgnoredDimensionValue = sequelize.define(
  'IgnoredDimensionValue',
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
    key: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    tableName: 'ignored_dimension_values',
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['dimension', 'key'],
      },
    ],
  },
);

module.exports = IgnoredDimensionValue;
