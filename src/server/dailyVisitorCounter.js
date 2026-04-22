const crypto = require('node:crypto');

const VISITOR_ID_PATTERN = /^[a-zA-Z0-9_-]{12,128}$/;

function buildDateKey(value) {
  return value.toISOString().slice(0, 10);
}

function sanitizeVisitorId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return VISITOR_ID_PATTERN.test(trimmed) ? trimmed : null;
}

function createDailyVisitorCounter({ now = () => new Date(), idFactory = () => crypto.randomUUID() } = {}) {
  const buckets = new Map();

  function pruneStaleBuckets(todayKey) {
    for (const key of buckets.keys()) {
      if (key !== todayKey) {
        buckets.delete(key);
      }
    }
  }

  function recordVisit(candidateVisitorId) {
    const todayKey = buildDateKey(now());
    pruneStaleBuckets(todayKey);

    let visitorId = sanitizeVisitorId(candidateVisitorId);
    if (!visitorId) {
      visitorId = String(idFactory()).replace(/[^a-zA-Z0-9_-]/g, '');
    }

    let todayVisitors = buckets.get(todayKey);
    if (!todayVisitors) {
      todayVisitors = new Set();
      buckets.set(todayKey, todayVisitors);
    }

    todayVisitors.add(visitorId);

    return {
      date: todayKey,
      dailyVisitors: todayVisitors.size,
      visitorId,
    };
  }

  return {
    recordVisit,
  };
}

module.exports = {
  createDailyVisitorCounter,
  sanitizeVisitorId,
};
