const { DataTypes } = require('sequelize');
const sequelize = require('..');
const TelegramGroup = require('./TelegramGroup');

const TelegramMessage = sequelize.define(
  'TelegramMessage',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    group_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: 'telegram_groups',
        key: 'id',
      },
    },
    message_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    message_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    text: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    sender_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    sender_username: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    has_media: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    media_type: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    raw: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    tableName: 'telegram_messages',
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['group_id', 'message_id'],
      },
      {
        fields: ['message_date'],
      },
    ],
  },
);

TelegramMessage.belongsTo(TelegramGroup, { foreignKey: 'group_id' });
TelegramGroup.hasMany(TelegramMessage, { foreignKey: 'group_id' });

module.exports = TelegramMessage;
