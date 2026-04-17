const sequelize = require('..');
const TelegramGroup = require('./TelegramGroup');
const TelegramMessage = require('./TelegramMessage');
const TelegramMessageImage = require('./TelegramMessageImage');

module.exports = {
  sequelize,
  TelegramGroup,
  TelegramMessage,
  TelegramMessageImage,
};
