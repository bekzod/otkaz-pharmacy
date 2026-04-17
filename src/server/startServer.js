require('dotenv').config();

const { createApp } = require('./app');
const models = require('../db/models');
const { createMedicineAnalyticsService } = require('./medicineAnalyticsService');

function listen(app, port, host) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host);

    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };

    const onListening = () => {
      server.off('error', onError);
      resolve(server);
    };

    server.once('error', onError);
    server.once('listening', onListening);
  });
}

function closeServer(server) {
  server.closeIdleConnections?.();
  server.closeAllConnections?.();

  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function startServer({
  port = Number(process.env.PORT) || 3000,
  host = process.env.HOST || '0.0.0.0',
  crawlerService,
  medicineAnalyticsService,
} = {}) {
  const activeCrawlerService = crawlerService || require('../crawler-telegram/service');
  const activeMedicineAnalyticsService =
    medicineAnalyticsService || createMedicineAnalyticsService({ models });
  const app = createApp({
    crawlerService: activeCrawlerService,
    medicineAnalyticsService: activeMedicineAnalyticsService,
  });
  const server = await listen(app, port, host);

  try {
    await activeCrawlerService.startCrawler();
  } catch (error) {
    await closeServer(server);
    throw error;
  }

  let stopPromise = null;

  async function stopServer() {
    if (stopPromise) return stopPromise;

    stopPromise = (async () => {
      await closeServer(server);
      await activeCrawlerService.stopCrawler();
    })();

    return stopPromise;
  }

  return {
    app,
    server,
    port: server.address().port,
    stopServer,
  };
}

module.exports = {
  startServer,
  closeServer,
};
