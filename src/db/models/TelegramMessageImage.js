const { DataTypes } = require('sequelize');
const sequelize = require('..');
const TelegramMessage = require('./TelegramMessage');

const TelegramMessageImage = sequelize.define(
  'TelegramMessageImage',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    message_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'telegram_messages',
        key: 'id',
      },
    },
    telegram_photo_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    mime_type: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    file_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    width: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    height: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    size_bytes: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    data: {
      type: DataTypes.BLOB('long'),
      allowNull: false,
    },
  },
  {
    tableName: 'telegram_message_images',
    underscored: true,
    indexes: [
      {
        fields: ['message_id'],
      },
    ],
  },
);

TelegramMessageImage.belongsTo(TelegramMessage, { foreignKey: 'message_id', onDelete: 'CASCADE' });
TelegramMessage.hasMany(TelegramMessageImage, { foreignKey: 'message_id', onDelete: 'CASCADE' });

module.exports = TelegramMessageImage;
