const { DataTypes } = require('sequelize');
const sequelize = require('..');

const ResetPoint = sequelize.define(
  'ResetPoint',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    dimension: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    reset_key: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    reset_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: 'reset_points',
    underscored: true,
    indexes: [
      {
        fields: ['dimension', 'reset_key', 'reset_at'],
      },
    ],
  },
);

module.exports = ResetPoint;
