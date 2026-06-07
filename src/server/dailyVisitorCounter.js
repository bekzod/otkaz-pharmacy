const crypto = require('node:crypto');

const VISITOR_ID_PATTERN = /^[a-zA-Z0-9_-]{12,128}$/;
const DEFAULT_MAX_VISITORS_IN_MEMORY = 50_000;
const OVERFLOW_BITMAP_BITS = 1 << 20; // 1,048,576 bits (~128KB)

function buildDateKey(value) {
  return value.toISOString().slice(0, 10);
}

function sanitizeVisitorId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return VISITOR_ID_PATTERN.test(trimmed) ? trimmed : null;
}

function fnv1a32(value) {
  let hash = 0x811c9dc5;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

function createOverflowTracker(bits = OVERFLOW_BITMAP_BITS) {
  const bytes = Math.ceil(bits / 8);
  const bitmap = new Uint8Array(bytes);
  let zeroBits = bits;

  function setBit(index) {
    const byteIndex = index >> 3;
    const bitMask = 1 << (index & 7);
    const wasSet = (bitmap[byteIndex] & bitMask) !== 0;
    if (!wasSet) {
      bitmap[byteIndex] |= bitMask;
      zeroBits -= 1;
    }
  }

  function add(visitorId) {
    const index = fnv1a32(visitorId) % bits;
    setBit(index);
  }

  function estimateCount() {
    if (zeroBits <= 0) return bits;
    return Math.round(-bits * Math.log(zeroBits / bits));
  }

  return {
    add,
    estimateCount,
  };
}

function createDailyVisitorCounter({
  now = () => new Date(),
  idFactory = () => crypto.randomUUID(),
  maxVisitorsInMemory = DEFAULT_MAX_VISITORS_IN_MEMORY,
} = {}) {
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
      todayVisitors = {
        visitors: new Set(),
        overflowTracker: null,
      };
      buckets.set(todayKey, todayVisitors);
    }

    if (todayVisitors.overflowTracker) {
      todayVisitors.overflowTracker.add(visitorId);
    } else {
      todayVisitors.visitors.add(visitorId);

      if (todayVisitors.visitors.size > maxVisitorsInMemory) {
        todayVisitors.overflowTracker = createOverflowTracker();
        for (const id of todayVisitors.visitors) {
          todayVisitors.overflowTracker.add(id);
        }
        todayVisitors.visitors.clear();
      }
    }

    const dailyVisitors = todayVisitors.overflowTracker
      ? todayVisitors.overflowTracker.estimateCount()
      : todayVisitors.visitors.size;

    return {
      date: todayKey,
      dailyVisitors,
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
