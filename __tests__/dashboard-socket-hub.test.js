const http = require('node:http');

const { createDashboardSocketHub } = require('../src/server/dashboardSocketHub');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1');
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function waitForMessage(socket) {
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      cleanup();
      resolve(JSON.parse(event.data));
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error('socket closed before a message arrived'));
    };
    const cleanup = () => {
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('error', onError);
      socket.removeEventListener('close', onClose);
    };

    socket.addEventListener('message', onMessage);
    socket.addEventListener('error', onError);
    socket.addEventListener('close', onClose);
  });
}

describe('dashboard websocket hub', () => {
  test('streams dashboard snapshots over websocket', async () => {
    const crawlerService = {
      getCrawlerStatus: jest.fn(() => ({
        state: 'running',
        totalIterations: 5,
      })),
    };
    const medicineAnalyticsService = {
      getAnalytics: jest
        .fn()
        .mockResolvedValueOnce({
          generatedAt: '2026-04-18T10:00:00.000Z',
          name: [],
          tradeName: [],
          medicineId: [],
        })
        .mockResolvedValueOnce({
          generatedAt: '2026-04-18T10:00:02.000Z',
          name: [],
          tradeName: [
            {
              key: 'paracetamol',
              label: 'Paracetamol',
              count1d: 2,
              count3d: 2,
              count30d: 2,
              count90d: 2,
              lastResetAt: null,
              canUndoLastReset: false,
            },
          ],
          medicineId: [],
        }),
    };

    const server = await listen(http.createServer());
    const hub = createDashboardSocketHub({
      crawlerService,
      medicineAnalyticsService,
      startedAt: new Date('2026-04-18T09:00:00.000Z'),
      broadcastIntervalMs: 60000,
    });
    hub.attach(server);

    const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);

    try {
      const initialSnapshot = await waitForMessage(socket);
      expect(initialSnapshot).toMatchObject({
        type: 'dashboard_snapshot',
        status: {
          ok: true,
          crawler: {
            state: 'running',
            totalIterations: 5,
          },
        },
        analytics: {
          tradeName: [],
        },
      });

      const nextSnapshotPromise = waitForMessage(socket);
      await hub.broadcastNow();
      const nextSnapshot = await nextSnapshotPromise;

      expect(nextSnapshot.analytics.tradeName).toEqual([
        expect.objectContaining({
          key: 'paracetamol',
          count90d: 2,
        }),
      ]);
    } finally {
      socket.close();
      await hub.close();
      await close(server);
    }
  });
});
