const sequelize = require('..');
const TelegramGroup = require('./TelegramGroup');
const TelegramMessage = require('./TelegramMessage');
const TelegramMessageImage = require('./TelegramMessageImage');
const TelegramMedicineEntry = require('./TelegramMedicineEntry');
const ResetPoint = require('./ResetPoint');
const IgnoredSourceText = require('./IgnoredSourceText');
const IgnoredDimensionValue = require('./IgnoredDimensionValue');

module.exports = {
  sequelize,
  TelegramGroup,
  TelegramMessage,
  TelegramMessageImage,
  TelegramMedicineEntry,
  ResetPoint,
  IgnoredSourceText,
  IgnoredDimensionValue,
};
