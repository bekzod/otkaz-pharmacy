const crypto = require('node:crypto');

function encodeWebSocketFrame(message) {
  const payload = Buffer.from(message);

  if (payload.length <= 125) {
    return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  }

  if (payload.length <= 65535) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
    return Buffer.concat([header, payload]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(payload.length), 2);
  return Buffer.concat([header, payload]);
}

function createDashboardSocketHub({
  crawlerService,
  medicineAnalyticsService,
  startedAt,
  now = () => new Date(),
  broadcastIntervalMs = 2000,
} = {}) {
  if (!crawlerService || typeof crawlerService.getCrawlerStatus !== 'function') {
    throw new Error('createDashboardSocketHub requires crawlerService.getCrawlerStatus()');
  }

  if (!medicineAnalyticsService || typeof medicineAnalyticsService.getAnalytics !== 'function') {
    throw new Error('createDashboardSocketHub requires medicineAnalyticsService.getAnalytics()');
  }

  const serverStartedAt = startedAt instanceof Date ? startedAt : now();
  const clients = new Set();
  let attachedServer = null;
  let interval = null;
  let broadcastPromise = null;
  let queuedBroadcast = false;

  function buildStatusPayload() {
    return {
      ok: true,
      server: {
        startedAt: serverStartedAt.toISOString(),
        uptimeMs: Date.now() - serverStartedAt.getTime(),
      },
      crawler: crawlerService.getCrawlerStatus(),
    };
  }

  async function buildSnapshot() {
    return {
      type: 'dashboard_snapshot',
      sentAt: now().toISOString(),
      status: buildStatusPayload(),
      analytics: await medicineAnalyticsService.getAnalytics(),
    };
  }

  function removeClient(socket) {
    if (!socket || !clients.has(socket)) return;
    clients.delete(socket);
    socket.removeAllListeners?.('close');
    socket.removeAllListeners?.('end');
    socket.removeAllListeners?.('error');
    socket.removeAllListeners?.('data');
    if (!socket.destroyed) {
      socket.destroy();
    }
  }

  function sendJson(socket, payload) {
    if (!socket || socket.destroyed || !clients.has(socket)) return;
    socket.write(encodeWebSocketFrame(JSON.stringify(payload)));
  }

  async function broadcastNow() {
    if (!clients.size) return null;

    if (broadcastPromise) {
      queuedBroadcast = true;
      return broadcastPromise;
    }

    broadcastPromise = (async () => {
      do {
        queuedBroadcast = false;
        const snapshot = await buildSnapshot();
        for (const socket of clients) {
          sendJson(socket, snapshot);
        }
      } while (queuedBroadcast && clients.size);
    })().finally(() => {
      broadcastPromise = null;
    });

    return broadcastPromise;
  }

  async function sendSnapshot(socket) {
    if (!clients.size || !clients.has(socket) || socket.destroyed) return;
    sendJson(socket, await buildSnapshot());
  }

  function handleUpgrade(request, socket) {
    const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
    if (pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const websocketKey = request.headers['sec-websocket-key'];
    if (!websocketKey) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    const acceptKey = crypto
      .createHash('sha1')
      .update(`${websocketKey}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`, 'utf8')
      .digest('base64');

    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`,
        '\r\n',
      ].join('\r\n'),
    );

    clients.add(socket);
    socket.setNoDelay?.(true);
    socket.on('data', (chunk) => {
      if (chunk?.length && (chunk[0] & 0x0f) === 0x08) {
        removeClient(socket);
      }
    });
    socket.on('error', () => removeClient(socket));
    socket.on('end', () => removeClient(socket));
    socket.on('close', () => removeClient(socket));

    sendSnapshot(socket).catch(() => removeClient(socket));
  }

  function attach(server) {
    if (!server) {
      throw new Error('attach requires a server');
    }

    attachedServer = server;
    attachedServer.on('upgrade', handleUpgrade);
    interval = setInterval(() => {
      broadcastNow().catch(() => {});
    }, broadcastIntervalMs);
    interval.unref?.();
  }

  async function close() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }

    if (attachedServer) {
      attachedServer.off('upgrade', handleUpgrade);
      attachedServer = null;
    }

    for (const socket of Array.from(clients)) {
      removeClient(socket);
    }
  }

  return {
    attach,
    broadcastNow,
    close,
  };
}

module.exports = {
  createDashboardSocketHub,
  encodeWebSocketFrame,
};
