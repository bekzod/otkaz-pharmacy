(function (global) {
  const NUMERIC_COLUMNS = new Set(['count1d', 'count3d', 'count15d', 'count30d']);

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function toTimestamp(value) {
    if (value == null) return null;
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }

  function buildLabelComparator(direction) {
    const lang =
      (global.i18n && typeof global.i18n.getLang === 'function' && global.i18n.getLang()) ||
      'en';
    const collator = new Intl.Collator(lang, { sensitivity: 'base', numeric: true });
    const sign = direction === 'asc' ? 1 : -1;
    return (a, b) => sign * collator.compare(a.label || '', b.label || '');
  }

  function buildNumericComparator(column, direction) {
    const sign = direction === 'asc' ? 1 : -1;
    return (a, b) => sign * (toNumber(a[column]) - toNumber(b[column]));
  }

  function buildLastResetComparator(direction) {
    const sign = direction === 'asc' ? 1 : -1;
    return (a, b) => {
      const ta = toTimestamp(a.lastResetAt);
      const tb = toTimestamp(b.lastResetAt);
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return sign * (ta - tb);
    };
  }

  function sortRows(rows, sort) {
    if (!sort || !sort.column || !sort.direction) return rows;
    if (!Array.isArray(rows) || rows.length < 2) return rows;

    let comparator;
    if (sort.column === 'label') {
      comparator = buildLabelComparator(sort.direction);
    } else if (sort.column === 'lastResetAt') {
      comparator = buildLastResetComparator(sort.direction);
    } else if (NUMERIC_COLUMNS.has(sort.column)) {
      comparator = buildNumericComparator(sort.column, sort.direction);
    } else {
      return rows;
    }

    return [...rows].sort(comparator);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { sortRows };
  } else {
    global.sortRows = sortRows;
  }
})(typeof window !== 'undefined' ? window : globalThis);
