const { DataTypes } = require('sequelize');
const sequelize = require('..');

const TelegramGroup = sequelize.define(
  'TelegramGroup',
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING,
    },
    link: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    disabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    last_crawled_message_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    crawled_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'telegram_groups',
    underscored: true,
  },
);

module.exports = TelegramGroup;
