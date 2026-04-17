const { sortRows } = require('../public/sort-rows.js');

function makeRow(overrides) {
  return {
    key: overrides.key || overrides.label || 'row',
    label: overrides.label || '',
    lastResetAt: overrides.lastResetAt ?? null,
    count1d: overrides.count1d ?? 0,
    count3d: overrides.count3d ?? 0,
    count30d: overrides.count30d ?? 0,
    ...overrides,
  };
}

describe('sortRows', () => {
  const rows = [
    makeRow({ key: 'a', label: 'Aspirin', count1d: 5, count3d: 10, count30d: 80, lastResetAt: '2026-04-15T00:00:00Z' }),
    makeRow({ key: 'b', label: 'Paracetamol', count1d: 20, count3d: 40, count30d: 100, lastResetAt: null }),
    makeRow({ key: 'c', label: 'Ibuprofen', count1d: 12, count3d: 12, count30d: 90, lastResetAt: '2026-04-10T00:00:00Z' }),
    makeRow({ key: 'd', label: 'Amoxicillin', count1d: 20, count3d: 30, count30d: 60, lastResetAt: '2026-04-18T00:00:00Z' }),
  ];

  test('returns the input array unchanged when column is null', () => {
    const result = sortRows(rows, { column: null, direction: null });
    expect(result).toEqual(rows);
  });

  test('sorts by count1d descending', () => {
    const result = sortRows(rows, { column: 'count1d', direction: 'desc' });
    expect(result.map((r) => r.key)).toEqual(['b', 'd', 'c', 'a']);
  });

  test('sorts by count1d ascending', () => {
    const result = sortRows(rows, { column: 'count1d', direction: 'asc' });
    expect(result.map((r) => r.key)).toEqual(['a', 'c', 'b', 'd']);
  });

  test('sorts by label ascending (locale-aware)', () => {
    const result = sortRows(rows, { column: 'label', direction: 'asc' });
    expect(result.map((r) => r.key)).toEqual(['d', 'a', 'c', 'b']);
  });

  test('sorts by label descending', () => {
    const result = sortRows(rows, { column: 'label', direction: 'desc' });
    expect(result.map((r) => r.key)).toEqual(['b', 'c', 'a', 'd']);
  });

  test('sinks null lastResetAt rows to the bottom regardless of direction', () => {
    const asc = sortRows(rows, { column: 'lastResetAt', direction: 'asc' });
    expect(asc.map((r) => r.key)).toEqual(['c', 'a', 'd', 'b']);
    expect(asc[asc.length - 1].lastResetAt).toBeNull();

    const desc = sortRows(rows, { column: 'lastResetAt', direction: 'desc' });
    expect(desc.map((r) => r.key)).toEqual(['d', 'a', 'c', 'b']);
    expect(desc[desc.length - 1].lastResetAt).toBeNull();
  });

  test('is stable for tied values (preserves input order)', () => {
    const tied = [
      makeRow({ key: 'x', count1d: 5 }),
      makeRow({ key: 'y', count1d: 5 }),
      makeRow({ key: 'z', count1d: 5 }),
    ];
    const result = sortRows(tied, { column: 'count1d', direction: 'desc' });
    expect(result.map((r) => r.key)).toEqual(['x', 'y', 'z']);
  });

  test('does not mutate the input array', () => {
    const input = [...rows];
    const snapshot = input.map((r) => r.key);
    sortRows(input, { column: 'count30d', direction: 'asc' });
    expect(input.map((r) => r.key)).toEqual(snapshot);
  });

  test('treats non-numeric counts as 0', () => {
    const messy = [
      makeRow({ key: 'ok', count1d: 10 }),
      makeRow({ key: 'null', count1d: null }),
      makeRow({ key: 'str', count1d: 'not a number' }),
    ];
    const result = sortRows(messy, { column: 'count1d', direction: 'desc' });
    expect(result[0].key).toBe('ok');
  });
});
