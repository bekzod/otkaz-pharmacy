const sequelize = require('..');
const TelegramGroup = require('./TelegramGroup');
const TelegramMessage = require('./TelegramMessage');
const TelegramMessageImage = require('./TelegramMessageImage');
const TelegramMedicineEntry = require('./TelegramMedicineEntry');
const ResetPoint = require('./ResetPoint');

module.exports = {
  sequelize,
  TelegramGroup,
  TelegramMessage,
  TelegramMessageImage,
  TelegramMedicineEntry,
  ResetPoint,
};
