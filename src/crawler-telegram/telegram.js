require('dotenv').config();

const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const API_ID = parseInt(process.env.TELEGRAM_API_ID, 10);
const API_HASH = process.env.TELEGRAM_API_HASH;

const phoneCodeHashStore = new Map();

const telegramClient = (session = '') => {
  const stringSession = new StringSession(session);
  return new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: Infinity,
    autoReconnect: true,
    retryDelay: 5000,
  });
};

const sendAuthCode = async (client, phone) => {
  await client.connect();
  const { phoneCodeHash } = await client.sendCode({ apiId: API_ID, apiHash: API_HASH }, phone);
  phoneCodeHashStore.set(phone, phoneCodeHash);
  return client;
};

const authWithCode = async (client, phone, code) => {
  await client.connect();
  const phoneCodeHash = phoneCodeHashStore.get(phone);
  const { user } = await client.invoke(
    new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash, phoneCode: code }),
  );
  return { sessionToken: client.session.save(), user };
};

module.exports = { telegramClient, sendAuthCode, authWithCode, Api };
