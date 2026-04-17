const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

function createTestRedisClient() {
  return {
    on() {
      return this;
    },
    async get() {
      return null;
    },
    async set() {
      return 'OK';
    },
    async incr() {
      return 1;
    },
    async del() {
      return 1;
    },
    async expire() {
      return 1;
    },
    async flushall() {
      return 'OK';
    },
    async publish() {
      return 0;
    },
    async quit() {
      return 'OK';
    },
    disconnect() {},
    duplicate() {
      return this;
    },
    async call() {
      return null;
    },
  };
}

const redisClient =
  process.env.NODE_ENV === 'test'
    ? createTestRedisClient()
    : new Redis(REDIS_URL, {
        lazyConnect: true,
      });

if (process.env.NODE_ENV !== 'test') {
  redisClient.on('error', (err) => {
    console.error('Redis connection error:', err?.message || err);
  });
}

module.exports = redisClient;
