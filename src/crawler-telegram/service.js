require('dotenv').config();

const { telegramClient } = require('./telegram');
const { createMedicineResolver } = require('./medicine-resolver');
const { createImageTextExtractor } = require('./image-text-extractor');
const { normalizeCapturedText } = require('../common/capturedText');
const logger = require('../common/logger').child({ component: 'telegram-crawler' });

const WAIT_TIME = 5500;
const MESSAGE_PAGE_LIMIT = 90;
const INITIAL_CHANNEL_MESSAGE_PAGE_LIMIT = 500;
const TELEGRAM_GET_MESSAGES_WAIT_MS = 1000;
const TELEGRAM_OPERATION_RETRY_ATTEMPTS = 3;
const TELEGRAM_OPERATION_TIMEOUT_MS = 30000;
const TELEGRAM_IMAGE_DOWNLOAD_TIMEOUT_MS = 60000;
const TELEGRAM_RECONNECT_WAIT_MS = 15000;
const TELEGRAM_RECONNECT_POLL_MS = 250;
const MEDICINE_LOOKUP_TIMEOUT_MS = 10000;
const MEDICINE_LOOKUP_RETRY_ATTEMPTS = 3;
const MEDICINE_LOOKUP_RETRY_BASE_DELAY_MS = 500;
const OPENAI_IMAGE_TEXT_MODEL = 'gpt-5-mini';
const OPENAI_IMAGE_TEXT_TIMEOUT_MS = 30000;
const OPENAI_IMAGE_TEXT_RETRY_ATTEMPTS = 3;
const OPENAI_IMAGE_TEXT_RETRY_BASE_DELAY_MS = 500;

function wait(ms = 3000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createCrawlerService({
  telegramClientFactory = telegramClient,
  models,
  medicineResolver,
  imageTextExtractor,
  time = { now: () => new Date(), wait },
  settings = {},
} = {}) {
  if (!models) {
    throw new Error('createCrawlerService requires models');
  }

  const {
    sequelize,
    TelegramGroup,
    TelegramMessage,
    TelegramMessageImage,
    TelegramMedicineEntry,
  } = models;

  if (!TelegramMedicineEntry) {
    throw new Error('createCrawlerService requires TelegramMedicineEntry');
  }

  const config = {
    WAIT_TIME,
    MESSAGE_PAGE_LIMIT,
    INITIAL_CHANNEL_MESSAGE_PAGE_LIMIT,
    TELEGRAM_GET_MESSAGES_WAIT_MS,
    TELEGRAM_OPERATION_RETRY_ATTEMPTS,
    TELEGRAM_OPERATION_TIMEOUT_MS,
    TELEGRAM_IMAGE_DOWNLOAD_TIMEOUT_MS,
    TELEGRAM_RECONNECT_WAIT_MS,
    TELEGRAM_RECONNECT_POLL_MS,
    MEDICINE_LOOKUP_TIMEOUT_MS,
    MEDICINE_LOOKUP_RETRY_ATTEMPTS,
    MEDICINE_LOOKUP_RETRY_BASE_DELAY_MS,
    OPENAI_IMAGE_TEXT_MODEL,
    OPENAI_IMAGE_TEXT_TIMEOUT_MS,
    OPENAI_IMAGE_TEXT_RETRY_ATTEMPTS,
    OPENAI_IMAGE_TEXT_RETRY_BASE_DELAY_MS,
    ...settings,
  };

  const activeMedicineResolver =
    medicineResolver ||
    createMedicineResolver({
      time,
      settings: {
        MEDICINE_LOOKUP_TIMEOUT_MS: config.MEDICINE_LOOKUP_TIMEOUT_MS,
        MEDICINE_LOOKUP_RETRY_ATTEMPTS: config.MEDICINE_LOOKUP_RETRY_ATTEMPTS,
        MEDICINE_LOOKUP_RETRY_BASE_DELAY_MS: config.MEDICINE_LOOKUP_RETRY_BASE_DELAY_MS,
      },
    });

  const activeImageTextExtractor =
    imageTextExtractor ||
    createImageTextExtractor({
      time,
      settings: {
        OPENAI_IMAGE_TEXT_MODEL: config.OPENAI_IMAGE_TEXT_MODEL,
        OPENAI_IMAGE_TEXT_TIMEOUT_MS: config.OPENAI_IMAGE_TEXT_TIMEOUT_MS,
        OPENAI_IMAGE_TEXT_RETRY_ATTEMPTS: config.OPENAI_IMAGE_TEXT_RETRY_ATTEMPTS,
        OPENAI_IMAGE_TEXT_RETRY_BASE_DELAY_MS: config.OPENAI_IMAGE_TEXT_RETRY_BASE_DELAY_MS,
      },
    });

  let client = null;
  let running = false;
  let stopRequested = false;
  let startingPromise = null;
  let stopPromise = null;
  let loopPromise = null;

  const runtime = {
    startedAt: null,
    stoppedAt: null,
    lastIterationStartedAt: null,
    lastIterationFinishedAt: null,
    lastIterationGroupCount: 0,
    totalIterations: 0,
    currentGroup: null,
    lastError: null,
  };

  function toIso(value) {
    return value instanceof Date ? value.toISOString() : null;
  }

  function serializeError(error) {
    if (!error) return null;

    return {
      name: error.name || 'Error',
      message: error.message || String(error),
      code: error.code || null,
      at: time.now().toISOString(),
    };
  }

  function getState() {
    if (stopPromise) return 'stopping';
    if (startingPromise) return 'starting';
    if (running) return 'running';
    if (runtime.startedAt) return 'stopped';
    return 'idle';
  }

  function getCrawlerStatus() {
    return {
      state: getState(),
      running,
      stopRequested,
      startedAt: toIso(runtime.startedAt),
      stoppedAt: toIso(runtime.stoppedAt),
      lastIterationStartedAt: toIso(runtime.lastIterationStartedAt),
      lastIterationFinishedAt: toIso(runtime.lastIterationFinishedAt),
      lastIterationGroupCount: runtime.lastIterationGroupCount,
      totalIterations: runtime.totalIterations,
      currentGroup: runtime.currentGroup,
      lastError: runtime.lastError,
      waitTimeMs: config.WAIT_TIME,
      messagePageLimit: config.MESSAGE_PAGE_LIMIT,
    };
  }

  function toTelegramEntityId(id) {
    if (id === null || id === undefined) return id;
    if (typeof id === 'string') {
      const trimmed = id.trim();
      if (!/^-?\d+$/.test(trimmed)) return trimmed;

      const parsed = Number(trimmed);
      if (!Number.isSafeInteger(parsed)) return trimmed;

      // Active groups are stored as raw Telegram channel IDs; GramJS expects the marked
      // `-100...` form when resolving channels by numeric identifier.
      return parsed > 0 ? Number(`-100${trimmed}`) : parsed;
    }

    if (typeof id === 'bigint') {
      if (id > 0n) return Number(`-100${id.toString()}`);
      return Number(id);
    }

    if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) {
      return Number(`-100${id}`);
    }

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

  async function waitForTelegramConnection(
    c,
    { timeoutMs = config.TELEGRAM_RECONNECT_WAIT_MS, pollMs = config.TELEGRAM_RECONNECT_POLL_MS } = {},
  ) {
    const deadline = Date.now() + timeoutMs;

    do {
      if (isTelegramTransportConnected(c)) return true;
      if (timeoutMs === 0 || Date.now() >= deadline) break;
      await time.wait(pollMs);
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
          timeoutMs: config.TELEGRAM_RECONNECT_WAIT_MS,
          pollMs: config.TELEGRAM_RECONNECT_POLL_MS,
        })
      ) {
        return;
      }
    }

    if (typeof c?.connect === 'function') {
      await c.connect();
      if (
        await waitForTelegramConnection(c, {
          timeoutMs: config.TELEGRAM_RECONNECT_WAIT_MS,
          pollMs: config.TELEGRAM_RECONNECT_POLL_MS,
        })
      ) {
        return;
      }
    }

    throw new Error(
      `[telegram-crawler] reconnect: transport did not recover within ${config.TELEGRAM_RECONNECT_WAIT_MS}ms`,
    );
  }

  async function ensureConnected(c, { attempts = 3, delayMs = 1500 } = {}) {
    let lastError = null;

    for (let i = 0; i < attempts; i += 1) {
      if (isTelegramTransportConnected(c)) return;

      try {
        await requestTelegramReconnect(c);
        if (isTelegramTransportConnected(c)) return;
      } catch (error) {
        lastError = error;
      }

      if (i < attempts - 1) await time.wait(delayMs);
    }

    if (!isTelegramTransportConnected(c)) {
      throw lastError || new Error('Telegram client is disconnected after retries');
    }
  }

  async function runTelegramOperation(
    c,
    label,
    operation,
    {
      attempts = config.TELEGRAM_OPERATION_RETRY_ATTEMPTS,
      timeoutMs = config.TELEGRAM_OPERATION_TIMEOUT_MS,
    } = {},
  ) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      await ensureConnected(c, { attempts: 1, delayMs: 0 });

      try {
        return await withTimeout(operation(), timeoutMs, label);
      } catch (error) {
        if (!isTelegramReconnectError(error) || attempt === attempts) throw error;

        logger.warn({ label, attempt, attempts, err: error }, 'transient disconnect, retrying');

        await requestTelegramReconnect(c, { force: true });
        await ensureConnected(c);
      }
    }
  }

  async function getTelegramClient() {
    const session = process.env.TELEGRAM_API_SESSION;

    if (!client) {
      client = telegramClientFactory(session);
    }

    await ensureConnected(client);
    logger.info('client connected');
    return client;
  }

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
      if (mime.startsWith('image/')) return 'photo';
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

  function hasPhoto(message) {
    return Boolean(message.media?.photo);
  }

  function hasImageDocument(message) {
    const mime = message.media?.document?.mimeType || '';
    return mime.startsWith('image/');
  }

  function getPhotoMeta(message) {
    const photo = message.media?.photo;
    if (!photo) return {};

    let width = null;
    let height = null;
    const sizes = Array.isArray(photo.sizes) ? photo.sizes : [];

    for (const size of sizes) {
      if (typeof size.w === 'number' && typeof size.h === 'number') {
        if (!width || size.w > width) {
          width = size.w;
          height = size.h;
        }
      }
    }

    return {
      telegram_photo_id: bigIntToNumber(photo.id),
      file_name: null,
      width,
      height,
      mime_type: 'image/jpeg',
    };
  }

  function getImageDocumentMeta(message) {
    const document = message.media?.document;
    if (!document) return {};

    const attributes = Array.isArray(document.attributes) ? document.attributes : [];

    let width = null;
    let height = null;
    let fileName = null;

    for (const attr of attributes) {
      const className = attr?.className || '';
      if (className === 'DocumentAttributeImageSize') {
        if (typeof attr.w === 'number') width = attr.w;
        if (typeof attr.h === 'number') height = attr.h;
      } else if (className === 'DocumentAttributeFilename' && typeof attr.fileName === 'string') {
        fileName = attr.fileName;
      }
    }

    return {
      telegram_photo_id: bigIntToNumber(document.id),
      file_name: fileName,
      width,
      height,
      mime_type: document.mimeType || 'image/jpeg',
    };
  }

  async function persistImageRecord(c, group, messageRecord, row, message, meta, label) {
    const where = { message_id: messageRecord.id };
    if (meta.telegram_photo_id !== null && meta.telegram_photo_id !== undefined) {
      where.telegram_photo_id = meta.telegram_photo_id;
    }

    const existing = await TelegramMessageImage.findOne({ where });
    if (existing) return existing;

    try {
      const buffer = await withTimeout(
        c.downloadMedia(message, {}),
        config.TELEGRAM_IMAGE_DOWNLOAD_TIMEOUT_MS,
        `download ${label} for message ${row.message_id}`,
      );

      if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;

      return TelegramMessageImage.create({
        message_id: messageRecord.id,
        telegram_photo_id: meta.telegram_photo_id,
        mime_type: meta.mime_type,
        file_name: meta.file_name,
        width: meta.width,
        height: meta.height,
        size_bytes: buffer.length,
        data: buffer,
        text_extraction_status: 'pending',
        text_extraction_model: null,
        text_extracted_lines: null,
        text_extraction_error: null,
        text_extracted_at: null,
      });
    } catch (error) {
      logger.warn(
        { groupId: group.id, groupName: group.name, messageId: row.message_id, err: error },
        `failed to download ${label}`,
      );
      return null;
    }
  }

  async function persistMessageWithImages(c, group, message) {
    const row = messageToRow(group.id, message);

    const [record, created] = await TelegramMessage.findOrCreate({
      where: { group_id: row.group_id, message_id: row.message_id },
      defaults: row,
    });

    const imageRecords = [];

    if (hasPhoto(message)) {
      const imageRecord = await persistImageRecord(
        c, group, record, row, message, getPhotoMeta(message), 'photo',
      );
      if (imageRecord) imageRecords.push(imageRecord);
    } else if (hasImageDocument(message)) {
      const imageRecord = await persistImageRecord(
        c, group, record, row, message, getImageDocumentMeta(message), 'image document',
      );
      if (imageRecord) imageRecords.push(imageRecord);
    }

    return { record, created, row, imageRecords };
  }

  async function ensureMedicineEntry({
    messageRecord,
    messageImageRecord = null,
    sourceType,
    sourceIndex,
    sourceText,
    label,
  }) {
    const existing = await TelegramMedicineEntry.findOne({
      where: {
        message_id: messageRecord.id,
        message_image_id: messageImageRecord?.id || null,
        source_type: sourceType,
        source_index: sourceIndex,
      },
    });

    if (existing) return existing;

    const resolution = await activeMedicineResolver.resolve(sourceText, { label });

    return TelegramMedicineEntry.create({
      message_id: messageRecord.id,
      message_image_id: messageImageRecord?.id || null,
      source_type: sourceType,
      source_index: sourceIndex,
      source_text: sourceText,
      medicine_id: resolution.medicineId,
      parser_result: resolution.parserResult,
      resolver_status: resolution.resolverStatus,
    });
  }

  async function getImageLines(row, imageRecord) {
    if (imageRecord.text_extraction_status === 'completed') {
      return (imageRecord.text_extracted_lines || []).map((line) => normalizeCapturedText(line)).filter(Boolean);
    }

    const result = await activeImageTextExtractor.extractLines({
      buffer: imageRecord.data,
      mimeType: imageRecord.mime_type || 'image/jpeg',
      label: `message ${row.message_id} image ${imageRecord.id}`,
    });

    if (typeof imageRecord.update === 'function') {
      await imageRecord.update({
        text_extraction_status: result.status,
        text_extraction_model: result.model,
        text_extracted_lines: result.status === 'completed' ? result.lines : null,
        text_extraction_error: result.errorMessage,
        text_extracted_at: time.now(),
      });
    }

    if (result.status !== 'completed') return [];

    return result.lines.map((line) => normalizeCapturedText(line)).filter(Boolean);
  }

  async function processMedicineEntries(messageRecord, row, imageRecords) {
    const sourceText = normalizeCapturedText(row.text);
    if (sourceText) {
      await ensureMedicineEntry({
        messageRecord,
        sourceType: 'message_text',
        sourceIndex: 0,
        sourceText,
        label: `message ${row.message_id} text`,
      });
    }

    for (const imageRecord of imageRecords) {
      const lines = await getImageLines(row, imageRecord);

      for (let index = 0; index < lines.length; index += 1) {
        await ensureMedicineEntry({
          messageRecord,
          messageImageRecord: imageRecord,
          sourceType: 'image_line',
          sourceIndex: index,
          sourceText: lines[index],
          label: `message ${row.message_id} image ${imageRecord.id} line ${index}`,
        });
      }
    }
  }

  async function crawlGroup(c, group) {
    const channelEntityId = toTelegramEntityId(group.id);
    const minId = group.last_crawled_message_id ? parseInt(group.last_crawled_message_id, 10) : 0;
    const messagePageLimit = minId
      ? config.MESSAGE_PAGE_LIMIT
      : config.INITIAL_CHANNEL_MESSAGE_PAGE_LIMIT || config.MESSAGE_PAGE_LIMIT;

    logger.info(
      {
        groupId: group.id,
        groupName: group.name,
        minId,
        messagePageLimit,
      },
      'fetching messages',
    );

    const batch = await runTelegramOperation(
      c,
      `${group.name || group.id}: fetch messages`,
      () =>
        c.getMessages(channelEntityId, {
          limit: messagePageLimit,
          ...(minId ? { minId } : {}),
        }),
    );

    logger.info({ groupId: group.id, groupName: group.name, count: batch.length }, 'fetched messages');

    let maxMessageId = minId;
    let persistedCount = 0;

    for (const message of batch) {
      if (stopRequested) break;

      const { record, created, row, imageRecords } = await persistMessageWithImages(c, group, message);
      await processMedicineEntries(record, row, imageRecords);

      if (created) persistedCount += 1;
      const idNum = bigIntToNumber(message.id);
      if (idNum && idNum > maxMessageId) maxMessageId = idNum;
    }

    if (maxMessageId && maxMessageId > minId) {
      await group.update({
        last_crawled_message_id: maxMessageId,
        crawled_date: time.now(),
      });
    }

    return persistedCount;
  }

  async function runIteration(c) {
    const groups = await TelegramGroup.findAll({ where: { disabled: false } });
    logger.info({ count: groups.length }, 'iterating active groups');

    let persistedCount = 0;

    for (const group of groups) {
      if (stopRequested) break;

      runtime.currentGroup = {
        id: String(group.id),
        name: group.name || group.title || null,
      };

      try {
        persistedCount += await crawlGroup(c, group);
      } catch (error) {
        logger.error({ groupId: group.id, groupName: group.name, err: error }, 'crawl failed');
      }

      if (!stopRequested) await time.wait(config.TELEGRAM_GET_MESSAGES_WAIT_MS);
    }

    runtime.currentGroup = null;
    runtime.lastIterationGroupCount = groups.length;

    return { groupCount: groups.length, persistedCount };
  }

  async function runLoop(c) {
    while (!stopRequested) {
      runtime.lastIterationStartedAt = time.now();

      try {
        await runIteration(c);
        runtime.totalIterations += 1;
        runtime.lastIterationFinishedAt = time.now();
        runtime.lastError = null;
      } catch (error) {
        runtime.lastIterationFinishedAt = time.now();
        runtime.lastError = serializeError(error);
        logger.error({ err: error }, 'iteration failed');
      }

      runtime.currentGroup = null;

      if (stopRequested) break;
      await time.wait(config.WAIT_TIME);
    }
  }

  async function cleanupResources() {
    const activeClient = client;
    client = null;

    if (activeClient && typeof activeClient.disconnect === 'function') {
      try {
        await activeClient.disconnect();
      } catch (error) {
        logger.warn({ err: error }, 'disconnect warning');
      }
    }

    if (sequelize && typeof sequelize.close === 'function') {
      try {
        await sequelize.close();
      } catch (error) {
        logger.warn({ err: error }, 'sequelize close warning');
      }
    }
  }

  async function startCrawler() {
    if (running) return getCrawlerStatus();
    if (startingPromise) return startingPromise;
    if (stopPromise) await stopPromise;

    stopRequested = false;
    runtime.lastError = null;
    runtime.startedAt = time.now();
    runtime.stoppedAt = null;

    const startTask = (async () => {
      try {
        const activeClient = await getTelegramClient();
        running = true;

        loopPromise = runLoop(activeClient)
          .catch((error) => {
            runtime.lastError = serializeError(error);
            logger.error({ err: error }, 'loop failed');
          })
          .finally(() => {
            running = false;
            runtime.currentGroup = null;
            runtime.stoppedAt = time.now();
          });
      } catch (error) {
        runtime.lastError = serializeError(error);
        runtime.stoppedAt = time.now();
        await cleanupResources();
        throw error;
      }
    })();

    startingPromise = startTask;

    try {
      await startTask;
    } finally {
      if (startingPromise === startTask) {
        startingPromise = null;
      }
    }

    return getCrawlerStatus();
  }

  async function stopCrawler() {
    if (stopPromise) return stopPromise;
    if (!running && !startingPromise && !loopPromise && !client) {
      return getCrawlerStatus();
    }

    stopRequested = true;

    stopPromise = (async () => {
      try {
        if (startingPromise) {
          try {
            await startingPromise;
          } catch {
            // start errors are already recorded in runtime.lastError
          }
        }

        if (loopPromise) {
          await loopPromise;
        }

        await cleanupResources();
      } finally {
        running = false;
        loopPromise = null;
        runtime.currentGroup = null;
        runtime.stoppedAt = runtime.stoppedAt || time.now();
        stopRequested = false;
      }

      return getCrawlerStatus();
    })().finally(() => {
      stopPromise = null;
    });

    return stopPromise;
  }

  return {
    startCrawler,
    stopCrawler,
    getCrawlerStatus,
    crawlGroup,
    persistMessageWithImages,
    messageToRow,
  };
}

let defaultCrawlerService = null;

function getDefaultCrawlerService() {
  if (!defaultCrawlerService) {
    const models = require('../db/models');
    defaultCrawlerService = createCrawlerService({ models });
  }

  return defaultCrawlerService;
}

module.exports = {
  createCrawlerService,
  getDefaultCrawlerService,
  startCrawler(...args) {
    return getDefaultCrawlerService().startCrawler(...args);
  },
  stopCrawler(...args) {
    return getDefaultCrawlerService().stopCrawler(...args);
  },
  getCrawlerStatus(...args) {
    return getDefaultCrawlerService().getCrawlerStatus(...args);
  },
  crawlGroup(...args) {
    return getDefaultCrawlerService().crawlGroup(...args);
  },
  persistMessageWithImages(...args) {
    return getDefaultCrawlerService().persistMessageWithImages(...args);
  },
  messageToRow(...args) {
    return getDefaultCrawlerService().messageToRow(...args);
  },
};
