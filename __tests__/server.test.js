const http = require('node:http');

const { startServer } = require('../src/server/startServer');

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      url,
      {
        agent: false,
        headers: { connection: 'close' },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            body,
            json: JSON.parse(body),
          });
        });
      },
    );

    req.on('error', reject);
  });
}

function requestText(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      url,
      {
        agent: false,
        headers: { connection: 'close' },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            text: body,
          });
        });
      },
    );

    req.on('error', reject);
  });
}

describe('server entry point', () => {
  test('serves health, status, and the frontend while coordinating crawler lifecycle', async () => {
    const crawlerService = {
      startCrawler: jest.fn().mockResolvedValue(),
      stopCrawler: jest.fn().mockResolvedValue(),
      getCrawlerStatus: jest.fn(() => ({
        state: 'running',
        running: true,
        totalIterations: 3,
        lastIterationGroupCount: 2,
        startedAt: '2026-04-17T10:00:00.000Z',
        lastIterationFinishedAt: '2026-04-17T10:05:00.000Z',
        currentGroup: null,
        lastError: null,
      })),
    };

    const runtime = await startServer({
      port: 0,
      host: '127.0.0.1',
      crawlerService,
    });

    try {
      const healthResponse = await requestJson(`http://127.0.0.1:${runtime.port}/health`);
      const statusResponse = await requestJson(`http://127.0.0.1:${runtime.port}/status`);
      const pageResponse = await requestText(`http://127.0.0.1:${runtime.port}/`);

      expect(healthResponse.status).toBe(200);
      expect(healthResponse.json).toEqual({ ok: true });

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.json).toMatchObject({
        ok: true,
        crawler: {
          state: 'running',
          running: true,
          totalIterations: 3,
        },
      });

      expect(pageResponse.status).toBe(200);
      expect(pageResponse.text).toContain('Express server and crawler are running together.');
      expect(crawlerService.startCrawler).toHaveBeenCalledTimes(1);
    } finally {
      await runtime.stopServer();
    }

    expect(crawlerService.stopCrawler).toHaveBeenCalledTimes(1);
  });
});
