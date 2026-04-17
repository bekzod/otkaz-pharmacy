require('dotenv').config();

const { telegramClient } = require('./telegram');
const { sequelize, TelegramGroup, TelegramMessage, TelegramMessageImage } = require('../db/models');

const WAIT_TIME = 5500;
const MESSAGE_PAGE_LIMIT = 90;
const TELEGRAM_GET_MESSAGES_WAIT_MS = 1000;
const TELEGRAM_OPERATION_RETRY_ATTEMPTS = 3;
const TELEGRAM_OPERATION_TIMEOUT_MS = 30000;
const TELEGRAM_IMAGE_DOWNLOAD_TIMEOUT_MS = 60000;
const TELEGRAM_RECONNECT_WAIT_MS = 15000;
const TELEGRAM_RECONNECT_POLL_MS = 250;

let client = null;
let shuttingDown = false;

// ============ Helpers ============

function wait(ms = 3000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toTelegramEntityId(id) {
  if (id === null || id === undefined) return id;
  if (typeof id === 'string') return /^-?\d+$/.test(id) ? Number(id) : id;
  if (typeof id === 'bigint') return Number(id);
  return id;
}

function normalizeTelegramMessageDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return null;

  const parsed = new Date(seconds * 1000);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isTelegramTransportConnected(c) {
  if (!c) return false;
  if (c._sender && typeof c._sender._transportConnected === 'function') {
    return Boolean(c._sender._transportConnected());
  }
  if (typeof c.connected === 'boolean') {
    return c.connected;
  }
  return typeof c.connect !== 'function';
}

function isTelegramReconnectError(error) {
  if (error?.code === 'TELEGRAM_OPERATION_TIMEOUT') return true;
  if (error?.code === -503) return true;

  const message = error?.message?.toLowerCase?.();
  if (!message) return false;

  return (
    message.includes('not connected') ||
    message.includes('connection closed') ||
    message.includes('while disconnected') ||
    message.includes('please reconnect')
  );
}

function withTimeout(promise, timeoutMs, label) {
  if (!timeoutMs) return promise;

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`[telegram-crawler] ${label}: timed out after ${timeoutMs}ms`);
      error.code = 'TELEGRAM_OPERATION_TIMEOUT';
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    timeoutPromise,
  ]);
}

// ============ Telegram Client Management ============

async function waitForTelegramConnection(
  c,
  { timeoutMs = TELEGRAM_RECONNECT_WAIT_MS, pollMs = TELEGRAM_RECONNECT_POLL_MS } = {},
) {
  const deadline = Date.now() + timeoutMs;

  do {
    if (isTelegramTransportConnected(c)) return true;
    if (timeoutMs === 0 || Date.now() >= deadline) break;
    await wait(pollMs);
  } while (Date.now() < deadline);

  return isTelegramTransportConnected(c);
}

async function requestTelegramReconnect(c, { force = false } = {}) {
  const sender = c?._sender;
  const shouldReconnect = force || !isTelegramTransportConnected(c);

  if (!c || !shouldReconnect) return;

  if (!force && (await waitForTelegramConnection(c, { timeoutMs: 0 }))) {
    return;
  }

  if (sender && typeof sender.reconnect === 'function') {
    if (!sender.isReconnecting) {
      await sender.reconnect();
    }
    if (
      await waitForTelegramConnection(c, {
        timeoutMs: TELEGRAM_RECONNECT_WAIT_MS,
        pollMs: TELEGRAM_RECONNECT_POLL_MS,
      })
    ) {
      return;
    }
  }

  if (typeof c?.connect === 'function') {
    await c.connect();
    if (
      await waitForTelegramConnection(c, {
        timeoutMs: TELEGRAM_RECONNECT_WAIT_MS,
        pollMs: TELEGRAM_RECONNECT_POLL_MS,
      })
    ) {
      return;
    }
  }

  throw new Error(
    `[telegram-crawler] reconnect: transport did not recover within ${TELEGRAM_RECONNECT_WAIT_MS}ms`,
  );
}

async function ensureConnected(c, { attempts = 3, delayMs = 1500 } = {}) {
  let lastError = null;

  for (let i = 0; i < attempts; i++) {
    if (isTelegramTransportConnected(c)) return;

    try {
      await requestTelegramReconnect(c);
      if (isTelegramTransportConnected(c)) return;
    } catch (e) {
      lastError = e;
    }

    if (i < attempts - 1) await wait(delayMs);
  }

  if (!isTelegramTransportConnected(c)) {
    throw lastError || new Error('Telegram client is disconnected after retries');
  }
}

async function runTelegramOperation(
  c,
  label,
  operation,
  { attempts = TELEGRAM_OPERATION_RETRY_ATTEMPTS, timeoutMs = TELEGRAM_OPERATION_TIMEOUT_MS } = {},
) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await ensureConnected(c, { attempts: 1, delayMs: 0 });

    try {
      return await withTimeout(operation(), timeoutMs, label);
    } catch (error) {
      if (!isTelegramReconnectError(error) || attempt === attempts) throw error;

      console.warn(
        `[telegram-crawler] ${label}: transient disconnect (${attempt}/${attempts}), retrying: ${error.message}`,
      );

      await requestTelegramReconnect(c, { force: true });
      await ensureConnected(c);
    }
  }
}

async function getTelegramClient() {
  const session = process.env.TELEGRAM_API_SESSION;

  if (!client) {
    client = telegramClient(session);
  }

  await ensureConnected(client);
  console.log('[telegram-crawler] client connected');
  return client;
}

// ============ Message Serialization ============

function bigIntToNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'object' && typeof value.toString === 'function') {
    const str = value.toString();
    return /^-?\d+$/.test(str) ? Number(str) : null;
  }
  return typeof value === 'number' ? value : null;
}

function detectMediaType(message) {
  const media = message.media;
  if (!media) return null;
  if (media.photo) return 'photo';
  if (media.document) {
    const mime = media.document.mimeType || '';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'document';
  }
  if (media.className) return media.className.replace(/^MessageMedia/, '').toLowerCase();
  return 'unknown';
}

function getSender(message) {
  const from = message.fromId || message.peerId;
  const senderId =
    bigIntToNumber(from?.userId) ||
    bigIntToNumber(from?.channelId) ||
    bigIntToNumber(from?.chatId);
  const senderUsername = message.sender?.username || null;
  return { senderId, senderUsername };
}

function messageToRow(groupId, message) {
  const { senderId, senderUsername } = getSender(message);
  return {
    group_id: groupId,
    message_id: bigIntToNumber(message.id),
    message_date: normalizeTelegramMessageDate(message.date),
    text: message.message || null,
    sender_id: senderId,
    sender_username: senderUsername,
    has_media: Boolean(message.media),
    media_type: detectMediaType(message),
    raw: safeSerialize(message),
  };
}

function safeSerialize(message) {
  try {
    return JSON.parse(
      JSON.stringify(message, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
    );
  } catch {
    return null;
  }
}

function hasPhoto(message) {
  return Boolean(message.media?.photo);
}

function getPhotoMeta(message) {
  const photo = message.media?.photo;
  if (!photo) return {};

  let width = null;
  let height = null;
  const sizes = Array.isArray(photo.sizes) ? photo.sizes : [];

  for (const s of sizes) {
    if (typeof s.w === 'number' && typeof s.h === 'number') {
      if (!width || s.w > width) {
        width = s.w;
        height = s.h;
      }
    }
  }

  return {
    telegram_photo_id: bigIntToNumber(photo.id),
    width,
    height,
    mime_type: 'image/jpeg',
  };
}

// ============ Persistence ============

async function persistMessageWithImages(c, group, message) {
  const row = messageToRow(group.id, message);

  const [record, created] = await TelegramMessage.findOrCreate({
    where: { group_id: row.group_id, message_id: row.message_id },
    defaults: row,
  });

  if (!created) return record;

  if (hasPhoto(message)) {
    try {
      const buffer = await withTimeout(
        c.downloadMedia(message, {}),
        TELEGRAM_IMAGE_DOWNLOAD_TIMEOUT_MS,
        `download photo for message ${row.message_id}`,
      );

      if (Buffer.isBuffer(buffer) && buffer.length > 0) {
        const meta = getPhotoMeta(message);
        await TelegramMessageImage.create({
          message_id: record.id,
          telegram_photo_id: meta.telegram_photo_id,
          mime_type: meta.mime_type,
          file_name: null,
          width: meta.width,
          height: meta.height,
          size_bytes: buffer.length,
          data: buffer,
        });
      }
    } catch (err) {
      console.warn(
        `[telegram-crawler] ${group.name || group.id}: failed to download photo for message ${row.message_id}: ${err.message}`,
      );
    }
  }

  return record;
}

// ============ Main Loop ============

async function crawlGroup(c, group) {
  const channelEntityId = toTelegramEntityId(group.id);
  const minId = group.last_crawled_message_id ? parseInt(group.last_crawled_message_id, 10) : 0;

  console.log(
    `[telegram-crawler] ${group.name || group.id}: fetching messages after minId=${minId}`,
  );

  const batch = await runTelegramOperation(
    c,
    `${group.name || group.id}: fetch messages`,
    () =>
      c.getMessages(channelEntityId, {
        limit: MESSAGE_PAGE_LIMIT,
        ...(minId ? { minId } : {}),
      }),
  );

  console.log(`[telegram-crawler] ${group.name || group.id}: fetched ${batch.length} messages`);

  let maxMessageId = minId;
  for (const message of batch) {
    if (shuttingDown) break;
    await persistMessageWithImages(c, group, message);
    const idNum = bigIntToNumber(message.id);
    if (idNum && idNum > maxMessageId) maxMessageId = idNum;
  }

  if (maxMessageId && maxMessageId > minId) {
    await group.update({
      last_crawled_message_id: maxMessageId,
      crawled_date: new Date(),
    });
  }
}

async function runIteration(c) {
  const groups = await TelegramGroup.findAll({ where: { disabled: false } });
  console.log(`[telegram-crawler] iterating ${groups.length} active groups`);

  for (const group of groups) {
    if (shuttingDown) break;
    try {
      await crawlGroup(c, group);
    } catch (err) {
      console.error(
        `[telegram-crawler] ${group.name || group.id}: crawl failed:`,
        err.message,
      );
    }
    if (!shuttingDown) await wait(TELEGRAM_GET_MESSAGES_WAIT_MS);
  }
}

async function main() {
  const c = await getTelegramClient();

  while (!shuttingDown) {
    try {
      await runIteration(c);
    } catch (err) {
      console.error('[telegram-crawler] iteration failed:', err);
    }
    if (shuttingDown) break;
    await wait(WAIT_TIME);
  }

  console.log('[telegram-crawler] shutting down');
  try {
    await client?.disconnect();
  } catch (err) {
    console.warn('[telegram-crawler] disconnect warning:', err.message);
  }
  await sequelize.close();
  process.exit(0);
}

function handleShutdown(signal) {
  if (shuttingDown) return;
  console.log(`[telegram-crawler] received ${signal}`);
  shuttingDown = true;
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

if (require.main === module) {
  main().catch((err) => {
    console.error('[telegram-crawler] fatal:', err);
    process.exit(1);
  });
}

module.exports = {
  main,
  crawlGroup,
  persistMessageWithImages,
  messageToRow,
};
