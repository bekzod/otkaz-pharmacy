const path = require('path');
const express = require('express');

function createApp({
  crawlerService,
  medicineAnalyticsService,
  publicDir = path.resolve(__dirname, '../../public'),
  now = () => new Date(),
  startedAt = now(),
  notifyDashboardUpdate,
} = {}) {
  if (!crawlerService || typeof crawlerService.getCrawlerStatus !== 'function') {
    throw new Error('createApp requires a crawlerService with getCrawlerStatus()');
  }

  const app = express();
  const bootedAt = startedAt instanceof Date ? startedAt : now();

  app.use(express.json());

  function triggerDashboardUpdate() {
    if (typeof notifyDashboardUpdate !== 'function') return;
    Promise.resolve(notifyDashboardUpdate()).catch(() => {});
  }

  function sendError(res, error) {
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    res.status(statusCode).json({
      ok: false,
      error: error?.message || 'Internal server error',
    });
  }

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/status', (_req, res) => {
    res.json({
      ok: true,
      server: {
        startedAt: bootedAt.toISOString(),
        uptimeMs: Date.now() - bootedAt.getTime(),
      },
      crawler: crawlerService.getCrawlerStatus(),
    });
  });

  if (medicineAnalyticsService) {
    app.get('/api/medicine-analytics', async (_req, res) => {
      try {
        const analytics = await medicineAnalyticsService.getAnalytics();
        res.json({
          ok: true,
          ...analytics,
        });
      } catch (error) {
        sendError(res, error);
      }
    });

    app.get('/api/medicine-analytics/series', async (req, res) => {
      try {
        const keys = Array.isArray(req.query?.keys)
          ? req.query.keys
          : req.query?.keys
            ? [req.query.keys]
            : [];

        const payload = await medicineAnalyticsService.getSeries({
          dimension: req.query?.dimension,
          keys,
        });

        res.json({
          ok: true,
          ...payload,
        });
      } catch (error) {
        sendError(res, error);
      }
    });

    app.post('/api/medicine-analytics/reset-points', async (req, res) => {
      try {
        const payload = await medicineAnalyticsService.createResetPoint({
          dimension: req.body?.dimension,
          resetKey: req.body?.resetKey,
        });

        res.status(201).json({
          ok: true,
          ...payload,
        });
        triggerDashboardUpdate();
      } catch (error) {
        sendError(res, error);
      }
    });

    app.delete('/api/medicine-analytics/reset-points/latest', async (req, res) => {
      try {
        const payload = await medicineAnalyticsService.undoLatestResetPoint({
          dimension: req.body?.dimension,
          resetKey: req.body?.resetKey,
        });

        res.json({
          ok: true,
          ...payload,
        });
        triggerDashboardUpdate();
      } catch (error) {
        sendError(res, error);
      }
    });

    app.post('/api/medicine-analytics/comments', async (req, res) => {
      try {
        const payload = await medicineAnalyticsService.setRowComment({
          dimension: req.body?.dimension,
          resetKey: req.body?.resetKey,
          comment: req.body?.comment,
        });

        res.status(201).json({
          ok: true,
          ...payload,
        });
        triggerDashboardUpdate();
      } catch (error) {
        sendError(res, error);
      }
    });

    app.delete('/api/medicine-analytics/comments', async (req, res) => {
      try {
        const payload = await medicineAnalyticsService.deleteRowComment({
          dimension: req.body?.dimension,
          resetKey: req.body?.resetKey,
        });

        res.json({
          ok: true,
          ...payload,
        });
        triggerDashboardUpdate();
      } catch (error) {
        sendError(res, error);
      }
    });

    app.post('/api/medicine-analytics/ignore', async (req, res) => {
      try {
        const payload = await medicineAnalyticsService.ignoreDimensionValue({
          dimension: req.body?.dimension,
          key: req.body?.key,
        });

        res.status(201).json({
          ok: true,
          ...payload,
        });
        triggerDashboardUpdate();
      } catch (error) {
        sendError(res, error);
      }
    });

    app.delete('/api/medicine-analytics/ignore', async (req, res) => {
      try {
        const payload = await medicineAnalyticsService.restoreIgnoredDimensionValue({
          dimension: req.body?.dimension,
          key: req.body?.key,
        });

        res.json({
          ok: true,
          ...payload,
        });
        triggerDashboardUpdate();
      } catch (error) {
        sendError(res, error);
      }
    });

    app.get('/api/ignored-texts', async (_req, res) => {
      try {
        const payload = await medicineAnalyticsService.getIgnoredTexts();
        res.json({
          ok: true,
          ...payload,
        });
        triggerDashboardUpdate();
      } catch (error) {
        sendError(res, error);
      }
    });

    app.delete('/api/ignored-texts', async (req, res) => {
      try {
        const payload = await medicineAnalyticsService.restoreIgnoredSourceText({
          sourceText: req.body?.sourceText,
        });

        res.json({
          ok: true,
          ...payload,
        });
      } catch (error) {
        sendError(res, error);
      }
    });
  }

  app.use(express.static(publicDir));

  app.get('/', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.get('/ignored-texts', (_req, res) => {
    res.sendFile(path.join(publicDir, 'ignored-texts.html'));
  });

  return app;
}

module.exports = { createApp };
