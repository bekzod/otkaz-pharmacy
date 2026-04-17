require('dotenv').config();

const input = require('input');
const { telegramClient, sendAuthCode, authWithCode } = require('./telegram');

(async () => {
  const phone = await input.text('Phone (e.g. +998...): ');
  const client = telegramClient();
  await sendAuthCode(client, phone);
  const code = await input.text('Telegram code: ');
  const { sessionToken, user } = await authWithCode(client, phone, code);
  console.log('\nSession token (save to TELEGRAM_API_SESSION):\n');
  console.log(sessionToken);
  console.log('\nAuthenticated as:', user?.username || user?.firstName || user?.id);
  await client.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
