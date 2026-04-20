const http = require('node:http');

const { createApp } = require('../src/server/app');

function requestJson(url, { method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const requestUrl = new URL(url);

    const req = http.request(
      {
        protocol: requestUrl.protocol,
        hostname: requestUrl.hostname,
        port: requestUrl.port,
        path: `${requestUrl.pathname}${requestUrl.search}`,
        method,
        agent: false,
        headers: {
          connection: 'close',
          ...(payload
            ? {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        let responseBody = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            body: responseBody,
            json: JSON.parse(responseBody),
          });
        });
      },
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
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
  test('serves status, analytics pages, and ignore-text routes', async () => {
    const crawlerService = {
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

    const medicineAnalyticsService = {
      getAnalytics: jest.fn().mockResolvedValue({
        generatedAt: '2026-04-17T10:06:00.000Z',
        name: [],
        tradeName: [],
        medicineId: [],
      }),
      getSeries: jest.fn().mockResolvedValue({
        generatedAt: '2026-04-17T10:06:00.000Z',
        dimension: 'tradeName',
        startDate: '2026-01-18',
        endDate: '2026-04-17',
        series: [],
      }),
      createResetPoint: jest.fn().mockResolvedValue({ row: null }),
      undoLatestResetPoint: jest.fn().mockResolvedValue({ row: null }),
      ignoreSourceText: jest.fn().mockResolvedValue({
        generatedAt: '2026-04-17T10:06:00.000Z',
        created: true,
        ignoredText: { sourceText: 'service message' },
        rows: [],
      }),
      getIgnoredTexts: jest.fn().mockResolvedValue({
        generatedAt: '2026-04-17T10:06:00.000Z',
        rows: [],
      }),
      restoreIgnoredSourceText: jest.fn().mockResolvedValue({
        generatedAt: '2026-04-17T10:06:00.000Z',
        restoredText: { sourceText: 'service message' },
        rows: [],
      }),
      ignoreDimensionValue: jest.fn().mockResolvedValue({
        generatedAt: '2026-04-17T10:06:00.000Z',
        created: true,
        ignoredDimensionValue: { dimension: 'tradeName', key: 'aspirin' },
        rows: [],
      }),
      restoreIgnoredDimensionValue: jest.fn().mockResolvedValue({
        generatedAt: '2026-04-17T10:06:00.000Z',
        restoredDimensionValue: { dimension: 'tradeName', key: 'aspirin' },
        rows: [],
      }),
      setRowComment: jest.fn().mockResolvedValue({
        generatedAt: '2026-04-17T10:06:00.000Z',
        dimension: 'tradeName',
        comment: {
          id: 'rc-1',
          dimension: 'tradeName',
          resetKey: 'aspirin',
          text: 'follow up',
        },
        row: { key: 'aspirin', comment: 'follow up' },
      }),
      deleteRowComment: jest.fn().mockResolvedValue({
        generatedAt: '2026-04-17T10:06:00.000Z',
        dimension: 'tradeName',
        row: { key: 'aspirin', comment: null },
      }),
      resolveRow: jest.fn().mockResolvedValue({
        generatedAt: '2026-04-17T10:06:00.000Z',
        dimension: 'tradeName',
        resolution: {
          id: 'rr-1',
          dimension: 'tradeName',
          resetKey: 'aspirin',
          resolvedAt: '2026-04-17T10:06:00.000Z',
        },
        row: { key: 'aspirin', isResolved: true },
      }),
      unresolveRow: jest.fn().mockResolvedValue({
        generatedAt: '2026-04-17T10:06:00.000Z',
        dimension: 'tradeName',
        row: { key: 'aspirin', isResolved: false },
      }),
    };

    const app = createApp({
      crawlerService,
      medicineAnalyticsService,
    });
    const server = await new Promise((resolve, reject) => {
      const activeServer = app.listen(0, '127.0.0.1');
      activeServer.once('listening', () => resolve(activeServer));
      activeServer.once('error', reject);
    });

    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const healthResponse = await requestJson(`${baseUrl}/health`);
      const statusResponse = await requestJson(`${baseUrl}/status`);
      const analyticsResponse = await requestJson(`${baseUrl}/api/medicine-analytics`);
      const ignoreDimensionResponse = await requestJson(
        `${baseUrl}/api/medicine-analytics/ignore`,
        {
          method: 'POST',
          body: { dimension: 'tradeName', key: 'aspirin' },
        },
      );
      const restoreDimensionResponse = await requestJson(
        `${baseUrl}/api/medicine-analytics/ignore`,
        {
          method: 'DELETE',
          body: { dimension: 'tradeName', key: 'aspirin' },
        },
      );
      const ignoredTextsResponse = await requestJson(`${baseUrl}/api/ignored-texts`);
      const restoreTextResponse = await requestJson(`${baseUrl}/api/ignored-texts`, {
        method: 'DELETE',
        body: { sourceText: 'service message' },
      });
      const setCommentResponse = await requestJson(
        `${baseUrl}/api/medicine-analytics/comments`,
        {
          method: 'POST',
          body: { dimension: 'trade_name', resetKey: 'aspirin', comment: 'follow up' },
        },
      );
      const deleteCommentResponse = await requestJson(
        `${baseUrl}/api/medicine-analytics/comments`,
        {
          method: 'DELETE',
          body: { dimension: 'trade_name', resetKey: 'aspirin' },
        },
      );
      const resolveResponse = await requestJson(
        `${baseUrl}/api/medicine-analytics/resolutions`,
        {
          method: 'POST',
          body: { dimension: 'trade_name', resetKey: 'aspirin' },
        },
      );
      const unresolveResponse = await requestJson(
        `${baseUrl}/api/medicine-analytics/resolutions`,
        {
          method: 'DELETE',
          body: { dimension: 'trade_name', resetKey: 'aspirin' },
        },
      );
      const pageResponse = await requestText(`${baseUrl}/`);
      const ignoredPageResponse = await requestText(`${baseUrl}/ignored-texts`);

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

      expect(analyticsResponse.status).toBe(200);
      expect(ignoreDimensionResponse.status).toBe(201);
      expect(restoreDimensionResponse.status).toBe(200);
      expect(ignoredTextsResponse.status).toBe(200);
      expect(restoreTextResponse.status).toBe(200);

      expect(setCommentResponse.status).toBe(201);
      expect(setCommentResponse.json).toMatchObject({
        ok: true,
        comment: { resetKey: 'aspirin', text: 'follow up' },
        row: { key: 'aspirin', comment: 'follow up' },
      });
      expect(deleteCommentResponse.status).toBe(200);
      expect(deleteCommentResponse.json).toMatchObject({
        ok: true,
        row: { key: 'aspirin', comment: null },
      });
      expect(medicineAnalyticsService.setRowComment).toHaveBeenCalledWith({
        dimension: 'trade_name',
        resetKey: 'aspirin',
        comment: 'follow up',
      });
      expect(medicineAnalyticsService.deleteRowComment).toHaveBeenCalledWith({
        dimension: 'trade_name',
        resetKey: 'aspirin',
      });

      expect(resolveResponse.status).toBe(201);
      expect(resolveResponse.json).toMatchObject({
        ok: true,
        resolution: { resetKey: 'aspirin' },
        row: { key: 'aspirin', isResolved: true },
      });
      expect(unresolveResponse.status).toBe(200);
      expect(unresolveResponse.json).toMatchObject({
        ok: true,
        row: { key: 'aspirin', isResolved: false },
      });
      expect(medicineAnalyticsService.resolveRow).toHaveBeenCalledWith({
        dimension: 'trade_name',
        resetKey: 'aspirin',
      });
      expect(medicineAnalyticsService.unresolveRow).toHaveBeenCalledWith({
        dimension: 'trade_name',
        resetKey: 'aspirin',
      });

      expect(pageResponse.status).toBe(200);
      expect(pageResponse.text).toContain('Ignored Texts');

      expect(ignoredPageResponse.status).toBe(200);
      expect(ignoredPageResponse.text).toContain('Ignored Texts');

      expect(medicineAnalyticsService.ignoreDimensionValue).toHaveBeenCalledWith({
        dimension: 'tradeName',
        key: 'aspirin',
      });
      expect(medicineAnalyticsService.restoreIgnoredDimensionValue).toHaveBeenCalledWith({
        dimension: 'tradeName',
        key: 'aspirin',
      });
      expect(medicineAnalyticsService.restoreIgnoredSourceText).toHaveBeenCalledWith({
        sourceText: 'service message',
      });
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});
