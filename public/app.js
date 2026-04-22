const t = (key, params) => window.i18n.t(key, params);

function formatDate(value) {
  if (!value) return t('notAvailable');

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString('ru-RU');
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return t('notAvailable');

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function setAnimatedText(id, value) {
  const element = document.getElementById(id);
  if (!element) return;

  const previousValue = element.textContent;
  element.textContent = value;

  if (previousValue && previousValue !== value) {
    element.classList.remove('value-flash');
    void element.offsetWidth;
    element.classList.add('value-flash');
  }
}

function formatCount(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}


function getOrCreateVisitorId() {
  const storageKey = 'otkaz.visitorId';
  const existing = window.localStorage?.getItem(storageKey);
  if (existing) return existing;

  const generated =
    window.crypto?.randomUUID?.().replace(/[^a-zA-Z0-9_-]/g, '') ||
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

  window.localStorage?.setItem(storageKey, generated);
  return generated;
}

async function refreshDailyVisitors() {
  try {
    if (!state.visitorId) {
      state.visitorId = getOrCreateVisitorId();
    }

    const payload = await requestJson('/api/visitors/daily', {
      headers: {
        'X-Visitor-Id': state.visitorId,
      },
    });

    setText('daily-visitors', formatCount(payload.dailyVisitors));
    setText('visitor-id-status', t('status.visitorsForDate', { date: payload.date }));
  } catch (error) {
    setText('daily-visitors', t('status.unavailable'));
    setText('visitor-id-status', error.message);
  }
}

const VIEW_CONFIG = {
  tradeName: {
    dimension: 'trade_name',
    titleKey: 'view.tradeName.title',
    emptyKey: 'view.tradeName.empty',
  },
  name: {
    dimension: 'name',
    titleKey: 'view.name.title',
    emptyKey: 'view.name.empty',
  },
};

const CHART_COLORS = ['#9a3f31', '#1f6f8b', '#c7791a', '#1e7d4c', '#8f5a99', '#3d5a80'];
const LATIN_TO_CYRILLIC_LAYOUT = {
  q: 'й',
  w: 'ц',
  e: 'у',
  r: 'к',
  t: 'е',
  y: 'н',
  u: 'г',
  i: 'ш',
  o: 'щ',
  p: 'з',
  '[': 'х',
  ']': 'ъ',
  a: 'ф',
  s: 'ы',
  d: 'в',
  f: 'а',
  g: 'п',
  h: 'р',
  j: 'о',
  k: 'л',
  l: 'д',
  ';': 'ж',
  "'": 'э',
  z: 'я',
  x: 'ч',
  c: 'с',
  v: 'м',
  b: 'и',
  n: 'т',
  m: 'ь',
  ',': 'б',
  '.': 'ю',
  '/': '.',
};
const LATIN_TO_CYRILLIC_TRANSLIT_MULTI = [
  ['shch', 'щ'],
  ['yo', 'ё'],
  ['yu', 'ю'],
  ['ya', 'я'],
  ['ye', 'е'],
  ['zh', 'ж'],
  ['kh', 'х'],
  ['ts', 'ц'],
  ['ch', 'ч'],
  ['sh', 'ш'],
];
const LATIN_TO_CYRILLIC_TRANSLIT_SINGLE = {
  a: 'а',
  b: 'б',
  c: 'с',
  d: 'д',
  e: 'е',
  f: 'ф',
  g: 'г',
  h: 'х',
  i: 'и',
  j: 'ж',
  k: 'к',
  l: 'л',
  m: 'м',
  n: 'н',
  o: 'о',
  p: 'п',
  q: 'к',
  r: 'р',
  s: 'с',
  t: 'т',
  u: 'у',
  v: 'в',
  w: 'в',
  x: 'кс',
  y: 'й',
  z: 'з',
};
const LATIN_MEDICINE_PHONETIC_REPLACEMENTS = [
  [/si(?=t)/gu, 'ce'],
  [/se(?=t)/gu, 'ce'],
  [/ph/gu, 'f'],
];
const CYRILLIC_MEDICINE_PHONETIC_REPLACEMENTS = [
  [/си(?=т)/gu, 'це'],
  [/се(?=т)/gu, 'це'],
];
const CYRILLIC_TO_LATIN_BASE = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ы: 'y',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  ь: '',
  ъ: '',
};
const rowSearchIndexCache = new WeakMap();

const state = {
  activeView: 'tradeName',
  analytics: null,
  previousAnalytics: null,
  busy: false,
  chartBusy: false,
  chartRequestId: 0,
  chartData: null,
  visitorId: null,
  lastStatusPayload: null,
  socket: null,
  socketConnected: false,
  socketReconnectTimer: null,
  openMenuKey: null,
  searchQuery: '',
  resolvedFilter: 'all',
  sort: { column: null, direction: null },
  selectionByView: {
    tradeName: [],
    name: [],
  },
};

function setBanner(message, tone = 'neutral') {
  window.toast?.show(message, tone);
}

function clearBanner() {
  // Toasts auto-dismiss; nothing to clear on routine refresh.
}

function renderLoadingRow(message) {
  const tableBody = document.getElementById('medicine-table-body');
  if (!tableBody) return;
  state.openMenuKey = null;

  const row = document.createElement('tr');
  row.className = 'empty-row';

  const cell = document.createElement('td');
  cell.colSpan = 6;
  cell.textContent = message;
  row.appendChild(cell);

  tableBody.replaceChildren(row);
}

let activeMenuCleanup = null;
let activeMenu = null;

function teardownActiveMenu() {
  if (activeMenuCleanup) {
    activeMenuCleanup();
    activeMenuCleanup = null;
  }
  if (activeMenu) {
    const panel = activeMenu.querySelector('.row-menu-panel');
    if (panel) {
      panel.style.left = '';
      panel.style.top = '';
      panel.style.visibility = '';
    }
  }
  activeMenu = null;
}

function updateMenuDirection(menu) {
  if (!menu) return;
  const panel = menu.querySelector('.row-menu-panel');
  if (!panel) return;

  if (!menu.open) {
    if (activeMenu === menu) teardownActiveMenu();
    return;
  }

  const summary = menu.querySelector('summary');
  if (!summary) return;

  const floatingApi = window.FloatingUIDOM;
  if (!floatingApi) return;

  if (activeMenu && activeMenu !== menu) teardownActiveMenu();
  activeMenu = menu;

  const { computePosition, autoUpdate, flip, shift, offset } = floatingApi;

  panel.style.visibility = 'hidden';

  activeMenuCleanup = autoUpdate(summary, panel, () => {
    computePosition(summary, panel, {
      placement: 'bottom-end',
      middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      Object.assign(panel.style, {
        left: `${x}px`,
        top: `${y}px`,
        visibility: 'visible',
      });
    });
  });
}

document.addEventListener(
  'toggle',
  (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains('row-menu')) return;
    if (target.open) {
      updateMenuDirection(target);
    } else if (activeMenu === target) {
      teardownActiveMenu();
    }
  },
  true,
);

function normalizeSearchValue(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function convertLatinLayoutToCyrillic(value) {
  return String(value || '')
    .toLowerCase()
    .split('')
    .map((char) => LATIN_TO_CYRILLIC_LAYOUT[char] || char)
    .join('');
}

function transliterateLatinToCyrillic(value) {
  const input = String(value || '').toLowerCase();
  let result = '';
  let index = 0;

  while (index < input.length) {
    let matched = false;

    for (const [latin, cyrillic] of LATIN_TO_CYRILLIC_TRANSLIT_MULTI) {
      if (input.startsWith(latin, index)) {
        result += cyrillic;
        index += latin.length;
        matched = true;
        break;
      }
    }

    if (matched) continue;

    const char = input[index];
    result += LATIN_TO_CYRILLIC_TRANSLIT_SINGLE[char] || char;
    index += 1;
  }

  return result.replace(/л(?=\p{L})(?![аеёийоуыэюяьъл])/gu, 'ль');
}

function transliterateCyrillicToLatin(value) {
  return String(value || '')
    .toLowerCase()
    .split('')
    .map((char) => CYRILLIC_TO_LATIN_BASE[char] ?? char)
    .join('');
}

function buildLatinMedicinePhoneticVariants(value) {
  const normalized = normalizeSearchValue(value);
  if (!normalized) return [];

  const variants = [];
  for (const [pattern, replacement] of LATIN_MEDICINE_PHONETIC_REPLACEMENTS) {
    const nextVariant = normalizeSearchValue(normalized.replace(pattern, replacement));
    if (nextVariant && nextVariant !== normalized) {
      variants.push(nextVariant);
    }
  }

  return [...new Set(variants)];
}

function buildCyrillicMedicinePhoneticVariants(value) {
  const normalized = normalizeSearchValue(value);
  if (!normalized) return [];

  const variants = [];
  for (const [pattern, replacement] of CYRILLIC_MEDICINE_PHONETIC_REPLACEMENTS) {
    const nextVariant = normalizeSearchValue(normalized.replace(pattern, replacement));
    if (nextVariant && nextVariant !== normalized) {
      variants.push(nextVariant);
    }
  }

  return [...new Set(variants)];
}

function buildLatinFromCyrillicVariants(value) {
  const base = normalizeSearchValue(transliterateCyrillicToLatin(value));
  if (!base) return [];

  const variants = new Set([base]);
  const looseVariants = [
    base.replace(/ts(?=[iey])/gu, 'c'),
    base.replace(/ks/gu, 'x'),
    base.replace(/f/gu, 'ph'),
    base.replace(/iy\b/gu, 'i'),
    base.replace(/yy/gu, 'y'),
  ]
    .map((variant) => normalizeSearchValue(variant))
    .filter(Boolean);

  looseVariants.forEach((variant) => variants.add(variant));
  return [...variants];
}

function buildSearchVariants(rawValue) {
  const original = normalizeSearchValue(rawValue);
  const layoutConverted = normalizeSearchValue(convertLatinLayoutToCyrillic(rawValue));
  const transliterated = normalizeSearchValue(transliterateLatinToCyrillic(rawValue));
  const latinFromCyrillicVariants = buildLatinFromCyrillicVariants(rawValue);
  const latinPhoneticVariants = [
    ...buildLatinMedicinePhoneticVariants(original),
    ...buildLatinMedicinePhoneticVariants(layoutConverted),
    ...buildLatinMedicinePhoneticVariants(transliterated),
    ...latinFromCyrillicVariants.flatMap((variant) => buildLatinMedicinePhoneticVariants(variant)),
  ];
  const cyrillicPhoneticVariants = [
    ...buildCyrillicMedicinePhoneticVariants(transliterated),
    ...latinPhoneticVariants
      .map((variant) => normalizeSearchValue(transliterateLatinToCyrillic(variant)))
      .filter(Boolean),
  ].flatMap((variant) => [variant, ...buildCyrillicMedicinePhoneticVariants(variant)]);

  return [
    ...new Set(
      [
        original,
        layoutConverted,
        transliterated,
        ...latinFromCyrillicVariants,
        ...latinPhoneticVariants,
        ...cyrillicPhoneticVariants,
      ].filter(Boolean),
    ),
  ];
}

function buildSearchTokenSets(rawQuery) {
  return [...new Set(buildSearchVariants(rawQuery))]
    .map((variant) => variant.split(' ').filter(Boolean))
    .filter((tokens) => tokens.length > 0);
}

function getRowSearchVariants(row) {
  if (rowSearchIndexCache.has(row)) {
    return rowSearchIndexCache.get(row);
  }

  const rawValues = [
    row.label,
    row.key,
    row.medicineId,
    [row.label || row.key, row.medicineId].filter(Boolean).join(' '),
  ].filter(Boolean);
  const variants = [
    ...new Set(
      rawValues
        .flatMap((value) => buildSearchVariants(value))
        .flatMap((variant) => [variant, variant.replace(/\s+/g, '')])
        .filter(Boolean),
    ),
  ];

  rowSearchIndexCache.set(row, variants);
  return variants;
}

function filterRowsBySearch(rows, rawQuery) {
  const tokenSets = buildSearchTokenSets(rawQuery);
  if (!tokenSets.length) return rows;

  return rows.filter((row) => {
    const rowVariants = getRowSearchVariants(row);
    return tokenSets.some((tokens) =>
      rowVariants.some((variant) => tokens.every((token) => variant.includes(token))),
    );
  });
}

function filterRowsByResolved(rows, filter) {
  if (filter === 'resolved') return rows.filter((row) => Boolean(row.isResolved));
  if (filter === 'unresolved') return rows.filter((row) => !row.isResolved);
  return rows;
}

function getRowsForActiveView() {
  return state.analytics?.[state.activeView] || [];
}

function syncSelection() {
  const rows = getRowsForActiveView();
  const allowedKeys = new Set(rows.map((row) => row.key));
  const currentSelection = state.selectionByView[state.activeView] || [];
  const nextSelection = currentSelection.filter((key) => allowedKeys.has(key));

  if (!nextSelection.length && rows.length) {
    nextSelection.push(rows[0].key);
  }

  state.selectionByView[state.activeView] = nextSelection;
}

function getSelectedKeys() {
  return state.selectionByView[state.activeView] || [];
}

function cycleSort(current, nextColumn) {
  if (!current || current.column !== nextColumn) {
    return { column: nextColumn, direction: 'desc' };
  }
  if (current.direction === 'desc') {
    return { column: nextColumn, direction: 'asc' };
  }
  return { column: null, direction: null };
}

function syncSortIndicators() {
  const indicatorGlyph = { asc: '▲', desc: '▼' };
  document.querySelectorAll('th.sortable-header').forEach((th) => {
    const column = th.dataset.sortColumn;
    const isActive = state.sort.column === column;
    const direction = isActive ? state.sort.direction : null;

    th.classList.toggle('is-sorted', isActive);
    th.setAttribute(
      'aria-sort',
      direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none',
    );

    const indicator = th.querySelector('.sort-indicator');
    if (indicator) {
      indicator.textContent = direction ? indicatorGlyph[direction] : '';
    }

    const button = th.querySelector('.column-sort-button');
    if (button) {
      const labelEl = button.querySelector('.column-sort-label');
      const columnName = labelEl ? labelEl.textContent : column;
      const stateKey = direction ? `sort.state.${direction}` : 'sort.state.none';
      button.setAttribute(
        'aria-label',
        t('sort.columnLabel', { column: columnName, state: t(stateKey) }),
      );
    }
  });
}

function renderStatus(payload) {
  const crawler = payload.crawler || {};
  const server = payload.server || {};
  const currentGroup =
    crawler.currentGroup?.name || crawler.currentGroup?.id || t('status.none');
  const lastError = crawler.lastError
    ? `${crawler.lastError.message}${crawler.lastError.code ? ` (${crawler.lastError.code})` : ''}`
    : t('status.none');

  setText('server-state', payload.ok ? t('status.online') : t('status.unavailable'));
  setText('server-uptime', t('status.uptime', { value: formatDuration(server.uptimeMs) }));
  setAnimatedText('crawler-state', crawler.state || t('status.unknown'));
  setAnimatedText(
    'crawler-iteration',
    t('status.iterations', {
      n: crawler.totalIterations || 0,
      g: crawler.lastIterationGroupCount || 0,
    }),
  );
  setText(
    'started-at',
    t('status.startedAt', { value: formatDate(crawler.startedAt || server.startedAt) }),
  );
  setAnimatedText('current-group', t('status.currentGroup', { value: currentGroup }));
  setText('analytics-updated', formatDate(state.analytics?.generatedAt));
  setAnimatedText('last-error', lastError);
}

function updateToolbarState() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === state.activeView);
  });
}

function formatShortDate(value) {
  if (!value) return '';

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' });
}

function createSvgNode(tagName, attributes = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tagName);
  Object.entries(attributes).forEach(([key, value]) => {
    node.setAttribute(key, value);
  });
  return node;
}

function buildLinePath(points, xForIndex, yForCount) {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xForIndex(index)} ${yForCount(point.count)}`)
    .join(' ');
}

function renderChartEmpty(message) {
  const chart = document.getElementById('trend-chart');
  const legend = document.getElementById('chart-legend');
  setText('chart-summary', message);

  if (chart) {
    chart.replaceChildren();

    const text = createSvgNode('text', {
      x: '50%',
      y: '50%',
      'text-anchor': 'middle',
      fill: '#65564a',
      'font-size': '16',
    });
    text.textContent = message;
    chart.appendChild(text);
  }

  if (legend) {
    legend.replaceChildren();
  }
}

function renderChart() {
  if (state.chartBusy) {
    renderChartEmpty(t('chart.loading'));
    return;
  }

  const payload = state.chartData;
  const chart = document.getElementById('trend-chart');
  const legend = document.getElementById('chart-legend');

  if (!payload?.series?.length || !chart || !legend) {
    renderChartEmpty(t('trend.selectPrompt'));
    return;
  }

  const width = 920;
  const height = 360;
  const margin = { top: 24, right: 18, bottom: 42, left: 48 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const yMax = Math.max(
    1,
    ...payload.series.flatMap((series) => series.points.map((point) => Number(point.count || 0))),
  );
  const yTicks = 4;
  const xPointCount = payload.series[0]?.points?.length || 0;
  const xForIndex = (index) =>
    margin.left + (index / Math.max(1, xPointCount - 1)) * plotWidth;
  const yForCount = (count) => margin.top + plotHeight - (count / yMax) * plotHeight;

  chart.replaceChildren();

  for (let tick = 0; tick <= yTicks; tick += 1) {
    const value = Math.round((yMax / yTicks) * tick);
    const y = yForCount(value);
    chart.appendChild(
      createSvgNode('line', {
        x1: margin.left,
        y1: y,
        x2: width - margin.right,
        y2: y,
        stroke: 'rgba(87, 68, 48, 0.12)',
      }),
    );

    const label = createSvgNode('text', {
      x: margin.left - 10,
      y: y + 4,
      'text-anchor': 'end',
      fill: '#65564a',
      'font-size': '12',
    });
    label.textContent = String(value);
    chart.appendChild(label);
  }

  chart.appendChild(
    createSvgNode('line', {
      x1: margin.left,
      y1: margin.top + plotHeight,
      x2: width - margin.right,
      y2: margin.top + plotHeight,
      stroke: 'rgba(87, 68, 48, 0.24)',
    }),
  );

  const xLabels = [0, Math.floor((xPointCount - 1) / 2), Math.max(0, xPointCount - 1)];
  xLabels.forEach((index) => {
    const dateValue = payload.series[0]?.points?.[index]?.date;
    if (!dateValue) return;

    const label = createSvgNode('text', {
      x: xForIndex(index),
      y: height - 10,
      'text-anchor': index === 0 ? 'start' : index === xPointCount - 1 ? 'end' : 'middle',
      fill: '#65564a',
      'font-size': '12',
    });
    label.textContent = formatShortDate(dateValue);
    chart.appendChild(label);
  });

  payload.series.forEach((series, index) => {
    const color = CHART_COLORS[index % CHART_COLORS.length];
    const path = createSvgNode('path', {
      d: buildLinePath(series.points, xForIndex, yForCount),
      fill: 'none',
      stroke: color,
      'stroke-width': '3',
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    });
    chart.appendChild(path);

    series.points.forEach((point, pointIndex) => {
      if (!point.count) return;

      chart.appendChild(
        createSvgNode('circle', {
          cx: xForIndex(pointIndex),
          cy: yForCount(point.count),
          r: '2.5',
          fill: color,
        }),
      );
    });
  });

  legend.replaceChildren();
  payload.series.forEach((series, index) => {
    const item = document.createElement('div');
    item.className = 'legend-item';

    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.backgroundColor = CHART_COLORS[index % CHART_COLORS.length];
    item.appendChild(swatch);

    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = series.label || series.key;
    copy.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'cell-meta';
    meta.textContent = series.lastResetAt
      ? t('row.resetAt', { date: formatDate(series.lastResetAt) })
      : t('row.noBaseline');
    copy.appendChild(meta);

    item.appendChild(copy);
    legend.appendChild(item);
  });

  setText('chart-summary', t('chart.summary', { n: payload.series.length }));
}

function renderAnalytics() {
  updateToolbarState();

  const config = VIEW_CONFIG[state.activeView];
  const allRows = getRowsForActiveView();
  const searchQuery = state.searchQuery.trim();
  const searchedRows = filterRowsBySearch(allRows, searchQuery);
  const filteredRows = filterRowsByResolved(searchedRows, state.resolvedFilter);
  const rows = window.sortRows(filteredRows, state.sort);
  const selectedKeys = new Set(getSelectedKeys());
  const previousRows = new Map(
    (state.previousAnalytics?.[state.activeView] || []).map((row) => [row.key, row]),
  );
  setText('analytics-updated', formatDate(state.analytics?.generatedAt));

  const tableBody = document.getElementById('medicine-table-body');
  if (!tableBody) return;

  if (!allRows.length) {
    renderLoadingRow(t(config.emptyKey));
    syncSortIndicators();
    return;
  }

  if (!rows.length) {
    renderLoadingRow(t('search.noResults', { query: searchQuery }));
    syncSortIndicators();
    return;
  }

  const fragment = document.createDocumentFragment();
  let openMenuStillExists = false;

  rows.forEach((row) => {
    const previousRow = previousRows.get(row.key) || null;
    const tr = document.createElement('tr');
    tr.dataset.rowKey = row.key;
    tr.className = 'data-row';
    tr.classList.toggle('is-selected', selectedKeys.has(row.key));
    tr.classList.toggle('is-resolved', Boolean(row.isResolved));

    const labelCell = document.createElement('td');
    labelCell.className = 'label-cell';

    const label = document.createElement('strong');
    label.textContent = row.label || row.key;
    label.className = 'copyable-label';
    label.dataset.copyText = row.label || row.key;
    label.title = t('copy.hint');
    labelCell.appendChild(label);

    if (row.isResolved) {
      const badge = document.createElement('span');
      badge.className = 'row-badge row-badge--resolved';
      const check = document.createElement('span');
      check.className = 'row-badge-check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✅';
      badge.appendChild(check);
      badge.appendChild(document.createTextNode(t('row.resolved')));
      if (row.resolvedAt) {
        badge.title = t('row.resolvedAt', { date: formatDate(row.resolvedAt) });
      }
      labelCell.appendChild(badge);
    }

    if (row.medicineId && row.medicineId !== row.label) {
      const medicineId = document.createElement('div');
      medicineId.className = 'cell-meta';
      medicineId.textContent = t('row.id', { id: row.medicineId });
      labelCell.appendChild(medicineId);
    }

    if (row.comment) {
      const commentLine = document.createElement('div');
      commentLine.className = 'cell-meta cell-comment';
      commentLine.textContent = row.comment;
      labelCell.appendChild(commentLine);
    }

    tr.appendChild(labelCell);

    const lastResetCell = document.createElement('td');
    lastResetCell.className = row.lastResetAt ? 'reset-date-cell' : 'reset-date-cell muted-cell';
    lastResetCell.textContent = row.lastResetAt
      ? formatDate(row.lastResetAt)
      : t('row.noBaseline');
    if (previousRow && previousRow.lastResetAt !== row.lastResetAt) {
      lastResetCell.classList.add('value-flash');
    }
    tr.appendChild(lastResetCell);

    ['count1d', 'count3d', 'count30d'].forEach((field) => {
      const countCell = document.createElement('td');
      countCell.className = 'count-cell';
      countCell.textContent = formatCount(row[field]);
      if (previousRow && previousRow[field] !== row[field]) {
        countCell.classList.add('value-flash');
      }
      tr.appendChild(countCell);
    });

    const menuCell = document.createElement('td');
    menuCell.className = 'actions-col';
    const menu = document.createElement('details');
    menu.className = 'row-menu';
    if (state.openMenuKey === row.key) {
      menu.open = true;
      openMenuStillExists = true;
    }
    const summary = document.createElement('summary');
    summary.className = 'row-menu-trigger';
    summary.setAttribute('aria-label', t('table.more'));
    summary.textContent = '⋯';
    menu.appendChild(summary);

    const menuPanel = document.createElement('div');
    menuPanel.className = 'row-menu-panel';

    const commentButton = document.createElement('button');
    commentButton.type = 'button';
    commentButton.className = 'row-menu-item';
    commentButton.dataset.action = 'comment';
    commentButton.dataset.dimension = config.dimension;
    commentButton.dataset.key = row.key;
    commentButton.dataset.label = row.label || row.key;
    commentButton.dataset.currentComment = row.comment || '';
    commentButton.disabled = state.busy;
    commentButton.textContent = row.comment
      ? t('row.editCommentButton')
      : t('row.addCommentButton');
    menuPanel.appendChild(commentButton);

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'row-menu-item';
    resetButton.dataset.action = 'reset';
    resetButton.dataset.dimension = config.dimension;
    resetButton.dataset.key = row.key;
    resetButton.dataset.label = row.label || row.key;
    resetButton.disabled = state.busy;
    resetButton.textContent = t('row.resetButton');
    menuPanel.appendChild(resetButton);

    if (row.canUndoLastReset) {
      const undoButton = document.createElement('button');
      undoButton.type = 'button';
      undoButton.className = 'row-menu-item';
      undoButton.dataset.action = 'undo';
      undoButton.dataset.dimension = config.dimension;
      undoButton.dataset.key = row.key;
      undoButton.dataset.label = row.label || row.key;
      undoButton.disabled = state.busy;
      undoButton.textContent = t('row.undoButton');
      menuPanel.appendChild(undoButton);
    }

    const resolveButton = document.createElement('button');
    resolveButton.type = 'button';
    resolveButton.className = 'row-menu-item';
    resolveButton.dataset.action = row.isResolved ? 'unresolve' : 'resolve';
    resolveButton.dataset.dimension = config.dimension;
    resolveButton.dataset.key = row.key;
    resolveButton.dataset.label = row.label || row.key;
    resolveButton.disabled = state.busy;
    resolveButton.textContent = row.isResolved
      ? t('row.unresolveButton')
      : t('row.resolveButton');
    menuPanel.appendChild(resolveButton);

    const ignoreButton = document.createElement('button');
    ignoreButton.type = 'button';
    ignoreButton.className = 'row-menu-item is-danger';
    ignoreButton.dataset.action = 'ignore';
    ignoreButton.dataset.dimension = config.dimension;
    ignoreButton.dataset.key = row.key;
    ignoreButton.dataset.label = row.label || row.key;
    ignoreButton.disabled = state.busy;
    ignoreButton.textContent = t('row.ignoreButton');
    menuPanel.appendChild(ignoreButton);

    menu.appendChild(menuPanel);
    menuCell.appendChild(menu);
    tr.appendChild(menuCell);

    fragment.appendChild(tr);
  });

  teardownActiveMenu();
  tableBody.replaceChildren(fragment);
  if (state.openMenuKey && !openMenuStillExists) {
    state.openMenuKey = null;
  }

  const openMenu = tableBody.querySelector('.row-menu[open]');
  if (openMenu) {
    updateMenuDirection(openMenu);
  }

  syncSortIndicators();
}

function areSelectionsEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function didRowsChange(previousRows = [], nextRows = []) {
  if (previousRows.length !== nextRows.length) return true;

  return nextRows.some((row, index) => {
    const previousRow = previousRows[index];
    if (!previousRow) return true;

    return (
      previousRow.key !== row.key ||
      previousRow.label !== row.label ||
      previousRow.medicineId !== row.medicineId ||
      previousRow.lastResetAt !== row.lastResetAt ||
      previousRow.count1d !== row.count1d ||
      previousRow.count3d !== row.count3d ||
      previousRow.count30d !== row.count30d ||
      previousRow.count90d !== row.count90d ||
      previousRow.canUndoLastReset !== row.canUndoLastReset ||
      previousRow.isResolved !== row.isResolved
    );
  });
}

async function applyDashboardSnapshot({ statusPayload, analyticsPayload, keepBanner = false } = {}) {
  const previousAnalytics = state.analytics;
  const previousSelection = [...getSelectedKeys()];

  state.previousAnalytics = previousAnalytics;
  state.analytics = analyticsPayload;
  state.lastStatusPayload = statusPayload;

  syncSelection();
  renderStatus(statusPayload);
  renderAnalytics();

  const activeViewChanged = didRowsChange(
    previousAnalytics?.[state.activeView] || [],
    analyticsPayload?.[state.activeView] || [],
  );
  const selectionChanged = !areSelectionsEqual(previousSelection, getSelectedKeys());

  if (activeViewChanged || selectionChanged) {
    await refreshSeries();
  }

  if (!keepBanner) {
    clearBanner();
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Request failed with ${response.status}`);
  }

  return payload;
}

function setBusy(value) {
  state.busy = value;
  renderAnalytics();
}

async function refreshSeries() {
  const selectedKeys = getSelectedKeys();
  const config = VIEW_CONFIG[state.activeView];

  if (!config || !selectedKeys.length) {
    state.chartData = null;
    state.chartBusy = false;
    renderChart();
    return;
  }

  state.chartBusy = true;
  const requestId = state.chartRequestId + 1;
  state.chartRequestId = requestId;
  renderChart();

  try {
    const params = new URLSearchParams({ dimension: config.dimension });
    selectedKeys.forEach((key) => params.append('keys', key));

    const payload = await requestJson(`/api/medicine-analytics/series?${params.toString()}`);
    if (requestId !== state.chartRequestId) return;

    state.chartData = payload;
    state.chartBusy = false;
    renderChart();
  } catch (error) {
    if (requestId !== state.chartRequestId) return;

    state.chartData = null;
    state.chartBusy = false;
    renderChartEmpty(error.message);
  }
}

async function refreshDashboard({ keepBanner = false } = {}) {
  try {
    const [statusPayload, analyticsPayload] = await Promise.all([
      requestJson('/status'),
      requestJson('/api/medicine-analytics'),
    ]);
    await applyDashboardSnapshot({ statusPayload, analyticsPayload, keepBanner });
    await refreshDailyVisitors();
  } catch (error) {
    setText('server-state', t('status.error'));
    setText('server-uptime', t('status.requestFailed'));
    setText('crawler-state', t('status.unavailable'));
    setText('crawler-iteration', t('status.retrying'));
    setText('analytics-updated', t('status.unavailable'));
    setText('last-error', error.message);
    setText('daily-visitors', t('status.unavailable'));
    setText('visitor-id-status', t('status.requestFailed'));
    renderLoadingRow(t('table.loadFailed'));
    setBanner(error.message, 'error');
  }
}

function getWebSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function scheduleSocketReconnect() {
  if (state.socketReconnectTimer) return;

  state.socketReconnectTimer = window.setTimeout(() => {
    state.socketReconnectTimer = null;
    connectDashboardSocket();
  }, 2000);
}

function connectDashboardSocket() {
  if (state.socket) return;

  const socket = new WebSocket(getWebSocketUrl());
  state.socket = socket;

  socket.addEventListener('open', () => {
    state.socketConnected = true;
  });

  socket.addEventListener('message', async (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload?.type !== 'dashboard_snapshot') return;

      await applyDashboardSnapshot({
        statusPayload: payload.status,
        analyticsPayload: payload.analytics,
        keepBanner: true,
      });
    } catch (_) {
      // Ignore malformed websocket messages and rely on manual refresh/fallback fetches.
    }
  });

  socket.addEventListener('error', () => {
    socket.close();
  });

  socket.addEventListener('close', () => {
    if (state.socket === socket) {
      state.socket = null;
      state.socketConnected = false;
      scheduleSocketReconnect();
    }
  });
}

async function mutateResetPoint(action, dimension, resetKey, label) {
  const url =
    action === 'reset'
      ? '/api/medicine-analytics/reset-points'
      : '/api/medicine-analytics/reset-points/latest';
  const method = action === 'reset' ? 'POST' : 'DELETE';

  setBusy(true);

  try {
    await requestJson(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dimension,
        resetKey,
      }),
    });

    setBanner(
      action === 'reset'
        ? t('reset.created', { label })
        : t('reset.removed', { label }),
      'success',
    );
    await refreshDashboard({ keepBanner: true });
  } catch (error) {
    setBanner(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

async function mutateResolution(action, dimension, resetKey, label) {
  const method = action === 'resolve' ? 'POST' : 'DELETE';

  setBusy(true);

  try {
    await requestJson('/api/medicine-analytics/resolutions', {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dimension,
        resetKey,
      }),
    });

    setBanner(
      action === 'resolve'
        ? t('row.resolvedToast', { label })
        : t('row.unresolvedToast', { label }),
      'success',
    );
    await refreshDashboard({ keepBanner: true });
  } catch (error) {
    setBanner(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

function openCommentModal(label, currentComment) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const modal = document.createElement('div');
    modal.className = 'modal';

    const title = document.createElement('h3');
    title.className = 'modal-title';
    title.textContent = t('row.commentPrompt', { label });

    const textarea = document.createElement('textarea');
    textarea.className = 'modal-textarea';
    textarea.rows = 5;
    textarea.value = currentComment || '';
    textarea.placeholder = t('row.commentPlaceholder');

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'modal-button modal-button--secondary';
    cancelButton.textContent = t('modal.cancel');

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'modal-button modal-button--primary';
    saveButton.textContent = t('modal.save');

    const leftGroup = document.createElement('div');
    leftGroup.className = 'modal-actions-left';
    if (currentComment) {
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'modal-button modal-button--danger';
      deleteButton.textContent = t('modal.delete');
      deleteButton.addEventListener('click', () => close({ action: 'delete' }));
      leftGroup.appendChild(deleteButton);
    }

    const rightGroup = document.createElement('div');
    rightGroup.className = 'modal-actions-right';
    rightGroup.appendChild(cancelButton);
    rightGroup.appendChild(saveButton);

    actions.appendChild(leftGroup);
    actions.appendChild(rightGroup);

    modal.appendChild(title);
    modal.appendChild(textarea);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    let settled = false;
    const close = (value) => {
      if (settled) return;
      settled = true;
      overlay.classList.remove('is-visible');
      document.removeEventListener('keydown', onKeydown);
      setTimeout(() => overlay.remove(), 200);
      resolve(value);
    };

    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(null);
      } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        close({ action: 'save', value: textarea.value });
      }
    };

    cancelButton.addEventListener('click', () => close(null));
    saveButton.addEventListener('click', () => close({ action: 'save', value: textarea.value }));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(null);
    });
    document.addEventListener('keydown', onKeydown);

    window.requestAnimationFrame(() => {
      overlay.classList.add('is-visible');
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
  });
}

async function editRowComment(dimension, resetKey, label, currentComment) {
  const result = await openCommentModal(label, currentComment);
  if (!result) return;

  if (result.action === 'delete') {
    if (!currentComment) return;
    setBusy(true);
    try {
      await requestJson('/api/medicine-analytics/comments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimension, resetKey }),
      });
      setBanner(t('row.commentRemoved', { label }), 'success');
      await refreshDashboard({ keepBanner: true });
    } catch (error) {
      setBanner(error.message, 'error');
    } finally {
      setBusy(false);
    }
    return;
  }

  const trimmed = (result.value || '').trim();
  const isDelete = trimmed === '';

  if (isDelete && !currentComment) {
    return;
  }

  setBusy(true);

  try {
    if (isDelete) {
      await requestJson('/api/medicine-analytics/comments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimension, resetKey }),
      });
      setBanner(t('row.commentRemoved', { label }), 'success');
    } else {
      await requestJson('/api/medicine-analytics/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimension, resetKey, comment: trimmed }),
      });
      setBanner(t('row.commentSaved', { label }), 'success');
    }
    await refreshDashboard({ keepBanner: true });
  } catch (error) {
    setBanner(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

async function ignoreDimensionValue(dimension, key, label) {
  if (!window.confirm(t('row.ignoreConfirm', { label }))) return;

  setBusy(true);

  try {
    await requestJson('/api/medicine-analytics/ignore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dimension, key }),
    });

    setBanner(t('row.ignored', { label }), 'success');
    await refreshDashboard({ keepBanner: true });
  } catch (error) {
    setBanner(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

async function copyLabelText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setBanner(t('copy.success', { label: text }), 'success');
  } catch (error) {
    setBanner(t('copy.failed'), 'error');
  }
}

document.addEventListener('click', (event) => {
  const menuTrigger = event.target.closest('.row-menu > summary');
  const openMenu = event.target.closest('.row-menu');
  document.querySelectorAll('.row-menu[open]').forEach((menu) => {
    if (menu !== openMenu) menu.open = false;
  });
  if (!openMenu) {
    state.openMenuKey = null;
  }

  if (menuTrigger) {
    const row = menuTrigger.closest('tr[data-row-key]');
    window.requestAnimationFrame(() => {
      const menu = menuTrigger.parentElement;
      state.openMenuKey = menu.open ? row?.dataset.rowKey || null : null;
      updateMenuDirection(menu);
    });
  }

  const copyTarget = event.target.closest('[data-copy-text]');
  if (copyTarget) {
    event.stopPropagation();
    copyLabelText(copyTarget.dataset.copyText);
    return;
  }

  const sortButton = event.target.closest('.column-sort-button');
  if (sortButton) {
    event.preventDefault();
    const column = sortButton.dataset.sortColumn;
    if (column) {
      state.sort = cycleSort(state.sort, column);
      state.openMenuKey = null;
      renderAnalytics();
    }
    return;
  }

  const actionButton = event.target.closest('[data-action]');
  if (actionButton) {
    if (state.busy) return;
    if (openMenu) openMenu.open = false;
    state.openMenuKey = null;

    const action = actionButton.dataset.action;
    if (action === 'ignore') {
      ignoreDimensionValue(
        actionButton.dataset.dimension,
        actionButton.dataset.key,
        actionButton.dataset.label,
      );
    } else if (action === 'comment') {
      editRowComment(
        actionButton.dataset.dimension,
        actionButton.dataset.key,
        actionButton.dataset.label,
        actionButton.dataset.currentComment || '',
      );
    } else if (action === 'resolve' || action === 'unresolve') {
      mutateResolution(
        action,
        actionButton.dataset.dimension,
        actionButton.dataset.key,
        actionButton.dataset.label,
      );
    } else {
      mutateResetPoint(
        action,
        actionButton.dataset.dimension,
        actionButton.dataset.key,
        actionButton.dataset.label,
      );
    }
    return;
  }

  const resolvedFilterButton = event.target.closest('[data-resolved-filter]');
  if (resolvedFilterButton) {
    const nextFilter = resolvedFilterButton.dataset.resolvedFilter;
    if (nextFilter && nextFilter !== state.resolvedFilter) {
      state.resolvedFilter = nextFilter;
      document
        .querySelectorAll('[data-resolved-filter]')
        .forEach((button) => {
          button.classList.toggle(
            'is-active',
            button.dataset.resolvedFilter === nextFilter,
          );
        });
      state.openMenuKey = null;
      renderAnalytics();
    }
    return;
  }

  const viewButton = event.target.closest('[data-view]');
  if (viewButton) {
    state.activeView = viewButton.dataset.view;
    state.openMenuKey = null;
    state.sort = { column: null, direction: null };
    syncSelection();
    renderAnalytics();
    refreshSeries();
    return;
  }

  if (openMenu) return;

  const row = event.target.closest('tr[data-row-key]');
  if (!row) return;

  const activeSelection = new Set(getSelectedKeys());
  const rowKey = row.dataset.rowKey;

  if (activeSelection.has(rowKey)) {
    activeSelection.delete(rowKey);
  } else {
    activeSelection.add(rowKey);
  }

  state.selectionByView[state.activeView] = Array.from(activeSelection);
  renderAnalytics();
  refreshSeries();
});

document.getElementById('medicine-search')?.addEventListener('input', (event) => {
  state.searchQuery = event.target.value || '';
  state.openMenuKey = null;
  renderAnalytics();
});

function initLanguage() {
  const currentLang = window.i18n.getLang();
  document.documentElement.lang = currentLang;
  window.i18n.applyStaticTranslations();

  const select = document.getElementById('language-select');
  if (!select) return;

  select.value = currentLang;
  select.addEventListener('change', (event) => {
    window.i18n.setLang(event.target.value);
    window.i18n.applyStaticTranslations();
    renderAnalytics();
    renderChart();
    refreshDailyVisitors();
    if (state.lastStatusPayload) {
      renderStatus(state.lastStatusPayload);
    }
  });
}

initLanguage();
renderLoadingRow(t('table.loading'));
setText('daily-visitors', t('status.loading'));
setText('visitor-id-status', t('status.visitorsInfoLoading'));
refreshDashboard();
connectDashboardSocket();
setInterval(() => {
  if (!state.busy && !state.socketConnected) {
    refreshDashboard({ keepBanner: true });
  }
}, 15000);
