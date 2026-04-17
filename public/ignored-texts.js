function formatCount(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return 'Not available';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString('ru-RU');
}

const DIMENSION_LABELS = {
  name: 'By name',
  tradeName: 'By trade name',
  medicineId: 'By medicine ID',
};

function rowTypeLabel(row) {
  if (row.kind === 'dimensionValue') {
    return DIMENSION_LABELS[row.dimension] || row.dimension;
  }
  return 'Captured text';
}

function setBanner(message, tone = 'neutral') {
  window.toast?.show(message, tone);
}

function clearBanner() {
  // Toasts auto-dismiss.
}

function renderLoading(message) {
  const tableBody = document.getElementById('ignored-text-table-body');
  if (!tableBody) return;

  const row = document.createElement('tr');
  row.className = 'empty-row';

  const cell = document.createElement('td');
  cell.colSpan = 4;
  cell.textContent = message;
  row.appendChild(cell);

  tableBody.replaceChildren(row);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Request failed with ${response.status}`);
  }

  return payload;
}

const state = {
  rows: [],
  busy: false,
};

function render() {
  const tableBody = document.getElementById('ignored-text-table-body');
  const summary = document.getElementById('ignored-summary');
  const refreshButton = document.getElementById('refresh-button');

  if (refreshButton) {
    refreshButton.disabled = state.busy;
  }

  if (summary) {
    summary.textContent = state.rows.length
      ? `${formatCount(state.rows.length)} ignored texts are currently excluded from analytics.`
      : 'No texts are currently ignored.';
  }

  if (!tableBody) return;

  if (!state.rows.length) {
    renderLoading('No texts are currently ignored.');
    return;
  }

  const fragment = document.createDocumentFragment();

  state.rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.className = 'data-row';

    const labelCell = document.createElement('td');
    labelCell.className = 'label-cell';

    const label = document.createElement('strong');
    label.textContent = row.label || row.key;
    labelCell.appendChild(label);

    const typeMeta = document.createElement('div');
    typeMeta.className = 'cell-meta';
    typeMeta.textContent = rowTypeLabel(row);
    labelCell.appendChild(typeMeta);

    tr.appendChild(labelCell);

    const ignoredAtCell = document.createElement('td');
    ignoredAtCell.textContent = formatDate(row.ignoredAt);
    tr.appendChild(ignoredAtCell);

    const countCell = document.createElement('td');
    countCell.className = 'count-cell';
    countCell.textContent =
      row.kind === 'sourceText' ? formatCount(row.count90d) : '—';
    tr.appendChild(countCell);

    const actionCell = document.createElement('td');
    const actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.className = 'row-action secondary';
    actionButton.dataset.action = 'restore';
    actionButton.dataset.kind = row.kind || 'sourceText';
    actionButton.dataset.key = row.key;
    if (row.dimension) actionButton.dataset.dimension = row.dimension;
    actionButton.disabled = state.busy;
    actionButton.textContent = window.i18n?.t('actions.restore') ?? 'Restore';
    actionCell.appendChild(actionButton);
    tr.appendChild(actionCell);

    fragment.appendChild(tr);
  });

  tableBody.replaceChildren(fragment);
}

async function refreshPage({ keepBanner = false } = {}) {
  state.busy = true;
  render();

  try {
    const payload = await requestJson('/api/ignored-texts');
    state.rows = payload.rows || [];
    render();

    if (!keepBanner) {
      clearBanner();
    }
  } catch (error) {
    state.rows = [];
    renderLoading('Unable to load ignored texts right now.');
    setBanner(error.message, 'error');
  } finally {
    state.busy = false;
    render();
  }
}

async function restoreRow({ kind, dimension, key }) {
  state.busy = true;
  render();

  const isDimension = kind === 'dimensionValue';
  const url = isDimension ? '/api/medicine-analytics/ignore' : '/api/ignored-texts';
  const body = isDimension ? { dimension, key } : { sourceText: key };

  try {
    await requestJson(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    setBanner(`Restored: ${key}`, 'success');
    await refreshPage({ keepBanner: true });
  } catch (error) {
    setBanner(error.message, 'error');
  } finally {
    state.busy = false;
    render();
  }
}

document.addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-action="restore"]');
  if (actionButton && !state.busy) {
    restoreRow({
      kind: actionButton.dataset.kind,
      dimension: actionButton.dataset.dimension,
      key: actionButton.dataset.key,
    });
  }
});

document.getElementById('refresh-button')?.addEventListener('click', () => {
  if (!state.busy) {
    refreshPage();
  }
});

function initLanguage() {
  if (!window.i18n) return;
  const currentLang = window.i18n.getLang();
  document.documentElement.lang = currentLang;
  window.i18n.applyStaticTranslations();

  const select = document.getElementById('language-select');
  if (!select) return;

  select.value = currentLang;
  select.addEventListener('change', (event) => {
    window.i18n.setLang(event.target.value);
    window.i18n.applyStaticTranslations();
    render();
  });
}

initLanguage();
renderLoading('Loading ignored texts.');
refreshPage();
