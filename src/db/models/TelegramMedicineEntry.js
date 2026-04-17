const { DataTypes } = require('sequelize');
const sequelize = require('..');
const TelegramMessage = require('./TelegramMessage');
const TelegramMessageImage = require('./TelegramMessageImage');

const TelegramMedicineEntry = sequelize.define(
  'TelegramMedicineEntry',
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
    message_image_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'telegram_message_images',
        key: 'id',
      },
    },
    source_type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    source_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    source_text: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    medicine_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    parser_result: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    resolver_status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    tableName: 'telegram_medicine_entries',
    underscored: true,
    indexes: [
      {
        fields: ['message_id'],
      },
      {
        fields: ['message_image_id'],
      },
    ],
  },
);

TelegramMedicineEntry.belongsTo(TelegramMessage, { foreignKey: 'message_id', onDelete: 'CASCADE' });
TelegramMessage.hasMany(TelegramMedicineEntry, { foreignKey: 'message_id', onDelete: 'CASCADE' });

TelegramMedicineEntry.belongsTo(TelegramMessageImage, {
  foreignKey: 'message_image_id',
  onDelete: 'CASCADE',
});
TelegramMessageImage.hasMany(TelegramMedicineEntry, {
  foreignKey: 'message_image_id',
  onDelete: 'CASCADE',
});

module.exports = TelegramMedicineEntry;
