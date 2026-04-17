function formatDate(value) {
  if (!value) return 'Not available';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString();
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'Not available';

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

function formatCount(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

const VIEW_CONFIG = {
  tradeName: {
    dimension: 'trade_name',
    title: 'Trade name counters',
    emptyState: 'No trade-name counters are available in the current 90-day window.',
  },
  name: {
    dimension: 'name',
    title: 'Name counters',
    emptyState: 'No name counters are available in the current 90-day window.',
  },
  medicineId: {
    dimension: 'medicine_id',
    title: 'Medicine ID counters',
    emptyState: 'No resolved medicine IDs are available in the current 90-day window.',
  },
};

const CHART_COLORS = ['#9a3f31', '#1f6f8b', '#c7791a', '#1e7d4c', '#8f5a99', '#3d5a80'];

const state = {
  activeView: 'tradeName',
  analytics: null,
  busy: false,
  chartBusy: false,
  chartRequestId: 0,
  chartData: null,
  selectionByView: {
    tradeName: [],
    name: [],
    medicineId: [],
  },
};

function setBanner(message, tone = 'neutral') {
  const banner = document.getElementById('banner');
  if (!banner) return;

  banner.hidden = false;
  banner.textContent = message;
  banner.dataset.tone = tone;
}

function clearBanner() {
  const banner = document.getElementById('banner');
  if (!banner) return;

  banner.hidden = true;
  banner.textContent = '';
  delete banner.dataset.tone;
}

function renderLoadingRow(message) {
  const tableBody = document.getElementById('medicine-table-body');
  if (!tableBody) return;

  const row = document.createElement('tr');
  row.className = 'empty-row';

  const cell = document.createElement('td');
  cell.colSpan = 7;
  cell.textContent = message;
  row.appendChild(cell);

  tableBody.replaceChildren(row);
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

function renderStatus(payload) {
  const crawler = payload.crawler || {};
  const server = payload.server || {};
  const currentGroup = crawler.currentGroup?.name || crawler.currentGroup?.id || 'None';
  const lastError = crawler.lastError
    ? `${crawler.lastError.message}${crawler.lastError.code ? ` (${crawler.lastError.code})` : ''}`
    : 'None';

  setText('server-state', payload.ok ? 'Online' : 'Unavailable');
  setText('server-uptime', `Uptime ${formatDuration(server.uptimeMs)}`);
  setText('crawler-state', crawler.state || 'Unknown');
  setText(
    'crawler-iteration',
      `${crawler.totalIterations || 0} iterations, ${crawler.lastIterationGroupCount || 0} groups`,
  );
  setText('started-at', `Started ${formatDate(crawler.startedAt || server.startedAt)}`);
  setText('current-group', `Current group ${currentGroup}`);
  setText('analytics-updated', formatDate(state.analytics?.generatedAt));
  setText('last-error', lastError);
}

function updateToolbarState() {
  const refreshButton = document.getElementById('refresh-button');
  if (refreshButton) {
    refreshButton.disabled = state.busy;
  }

  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === state.activeView);
  });
}

function formatShortDate(value) {
  if (!value) return '';

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
    renderChartEmpty('Loading 90-day daily counts.');
    return;
  }

  const payload = state.chartData;
  const chart = document.getElementById('trend-chart');
  const legend = document.getElementById('chart-legend');

  if (!payload?.series?.length || !chart || !legend) {
    renderChartEmpty('Select medicines from the table to compare their daily counts.');
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
      ? `Reset ${formatDate(series.lastResetAt)}`
      : 'No reset baseline';
    copy.appendChild(meta);

    item.appendChild(copy);
    legend.appendChild(item);
  });

  setText(
    'chart-summary',
    `${payload.series.length} active medicine${payload.series.length === 1 ? '' : 's'} across the last 90 days. Counts before each row's latest reset are shown as zero.`,
  );
}

function renderAnalytics() {
  updateToolbarState();

  const config = VIEW_CONFIG[state.activeView];
  const rows = getRowsForActiveView();
  const selectedKeys = new Set(getSelectedKeys());

  setText(
    'analytics-summary',
    `${config.title}. Sorted by 90-day count. Click rows to plot them in the 90-day daily chart.`,
  );
  setText('analytics-updated', formatDate(state.analytics?.generatedAt));

  const tableBody = document.getElementById('medicine-table-body');
  if (!tableBody) return;

  if (!rows.length) {
    renderLoadingRow(config.emptyState);
    return;
  }

  const fragment = document.createDocumentFragment();

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.dataset.rowKey = row.key;
    tr.className = 'data-row';
    tr.classList.toggle('is-selected', selectedKeys.has(row.key));

    const labelCell = document.createElement('td');
    labelCell.className = 'label-cell';

    const label = document.createElement('strong');
    label.textContent = row.label || row.key;
    labelCell.appendChild(label);

    if (row.medicineId && row.medicineId !== row.label) {
      const medicineId = document.createElement('div');
      medicineId.className = 'cell-meta';
      medicineId.textContent = `ID ${row.medicineId}`;
      labelCell.appendChild(medicineId);
    }

    const resetMeta = document.createElement('div');
    resetMeta.className = 'cell-meta';
    resetMeta.textContent = row.lastResetAt
      ? `Reset ${formatDate(row.lastResetAt)}`
      : 'No reset baseline';
    labelCell.appendChild(resetMeta);

    tr.appendChild(labelCell);

    ['count1d', 'count3d', 'count30d', 'count90d'].forEach((field) => {
      const countCell = document.createElement('td');
      countCell.className = 'count-cell';
      countCell.textContent = formatCount(row[field]);
      tr.appendChild(countCell);
    });

    const resetCell = document.createElement('td');
    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'row-action';
    resetButton.dataset.action = 'reset';
    resetButton.dataset.dimension = config.dimension;
    resetButton.dataset.key = row.key;
    resetButton.dataset.label = row.label || row.key;
    resetButton.disabled = state.busy;
    resetButton.textContent = 'Reset';
    resetCell.appendChild(resetButton);
    tr.appendChild(resetCell);

    const undoCell = document.createElement('td');
    if (row.canUndoLastReset) {
      const undoButton = document.createElement('button');
      undoButton.type = 'button';
      undoButton.className = 'row-action secondary';
      undoButton.dataset.action = 'undo';
      undoButton.dataset.dimension = config.dimension;
      undoButton.dataset.key = row.key;
      undoButton.dataset.label = row.label || row.key;
      undoButton.disabled = state.busy;
      undoButton.textContent = 'Undo last';
      undoCell.appendChild(undoButton);
    } else {
      undoCell.className = 'muted-cell';
      undoCell.textContent = 'None';
    }
    tr.appendChild(undoCell);

    fragment.appendChild(tr);
  });

  tableBody.replaceChildren(fragment);
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

    state.analytics = analyticsPayload;
    syncSelection();
    renderStatus(statusPayload);
    renderAnalytics();
    await refreshSeries();

    if (!keepBanner) {
      clearBanner();
    }
  } catch (error) {
    setText('server-state', 'Error');
    setText('server-uptime', 'Status request failed');
    setText('crawler-state', 'Unavailable');
    setText('crawler-iteration', 'Retrying shortly');
    setText('analytics-updated', 'Unavailable');
    setText('last-error', error.message);
    renderLoadingRow('Unable to load medicine counters right now.');
    setBanner(error.message, 'error');
  }
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
        ? `Reset created for ${label}.`
        : `Last reset removed for ${label}.`,
      'success',
    );
    await refreshDashboard({ keepBanner: true });
  } catch (error) {
    setBanner(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

document.addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-action]');
  if (actionButton) {
    if (state.busy) return;

    mutateResetPoint(
      actionButton.dataset.action,
      actionButton.dataset.dimension,
      actionButton.dataset.key,
      actionButton.dataset.label,
    );
    return;
  }

  const viewButton = event.target.closest('[data-view]');
  if (viewButton) {
    state.activeView = viewButton.dataset.view;
    syncSelection();
    renderAnalytics();
    refreshSeries();
    return;
  }

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

document.getElementById('refresh-button')?.addEventListener('click', () => {
  if (!state.busy) {
    refreshDashboard();
  }
});

renderLoadingRow('Loading medicine counters.');
refreshDashboard();
setInterval(() => {
  if (!state.busy) {
    refreshDashboard({ keepBanner: true });
  }
}, 15000);
