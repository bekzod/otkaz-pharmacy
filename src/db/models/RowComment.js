const { DataTypes } = require('sequelize');
const sequelize = require('..');

const RowComment = sequelize.define(
  'RowComment',
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
    comment: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'row_comments',
    underscored: true,
    indexes: [
      {
        name: 'row_comments_active_dimension_key_unique',
        unique: true,
        fields: ['dimension', 'row_key'],
        where: { deleted_at: null },
      },
      {
        name: 'row_comments_dimension_key_deleted_at_idx',
        fields: ['dimension', 'row_key', 'deleted_at'],
      },
    ],
  },
);

module.exports = RowComment;
