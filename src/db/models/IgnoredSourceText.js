const { DataTypes } = require('sequelize');
const sequelize = require('..');

const IgnoredSourceText = sequelize.define(
  'IgnoredSourceText',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    source_text: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
  },
  {
    tableName: 'ignored_source_texts',
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['source_text'],
      },
    ],
  },
);

module.exports = IgnoredSourceText;
