const { createDailyVisitorCounter, sanitizeVisitorId } = require('../src/server/dailyVisitorCounter');

describe('daily visitor counter', () => {
  test('counts unique visitors per day and resets on new day', () => {
    const nowDates = ['2026-04-22T09:00:00.000Z', '2026-04-22T12:00:00.000Z', '2026-04-23T09:00:00.000Z'];
    let index = 0;
    const counter = createDailyVisitorCounter({
      now: () => new Date(nowDates[Math.min(index, nowDates.length - 1)]),
      idFactory: () => 'generatedvisitorid123',
    });

    const first = counter.recordVisit('visitor-alpha-12345');
    index += 1;
    const second = counter.recordVisit('visitor-alpha-12345');
    index += 1;
    const third = counter.recordVisit('visitor-beta-67890');

    expect(first).toMatchObject({ date: '2026-04-22', dailyVisitors: 1 });
    expect(second).toMatchObject({ date: '2026-04-22', dailyVisitors: 1 });
    expect(third).toMatchObject({ date: '2026-04-23', dailyVisitors: 1 });
  });

  test('sanitizes visitor ids', () => {
    expect(sanitizeVisitorId('visitor-alpha-12345')).toBe('visitor-alpha-12345');
    expect(sanitizeVisitorId('bad id')).toBeNull();
    expect(sanitizeVisitorId('')).toBeNull();
  });

  test('switches to bounded overflow tracking when visitor count is high', () => {
    const counter = createDailyVisitorCounter({
      now: () => new Date('2026-04-22T09:00:00.000Z'),
      maxVisitorsInMemory: 2,
    });

    const first = counter.recordVisit('visitor-alpha-12345');
    const second = counter.recordVisit('visitor-beta-67890');
    const third = counter.recordVisit('visitor-charlie-12345');

    expect(first.dailyVisitors).toBe(1);
    expect(second.dailyVisitors).toBe(2);
    expect(third.dailyVisitors).toBeGreaterThanOrEqual(3);
  });
});
