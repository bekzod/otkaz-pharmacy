require('dotenv').config();

const { startServer } = require('./src/server/startServer');
const logger = require('./src/common/logger').child({ component: 'server' });

let runtime = null;
let shutdownPromise = null;

function handleShutdown(signal) {
  if (shutdownPromise) return shutdownPromise;

  logger.info({ signal }, 'received shutdown signal');

  shutdownPromise = (async () => {
    try {
      if (runtime) {
        await runtime.stopServer();
      }
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'shutdown failed');
      process.exit(1);
    }
  })();

  return shutdownPromise;
}

async function main() {
  runtime = await startServer();
  logger.info({ port: runtime.port }, 'listening');

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  return runtime;
}

if (require.main === module) {
  main().catch((error) => {
    logger.error({ err: error }, 'fatal');
    process.exit(1);
  });
}

module.exports = {
  main,
  startServer,
};
