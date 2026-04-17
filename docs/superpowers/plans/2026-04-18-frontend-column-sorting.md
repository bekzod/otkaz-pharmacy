# Frontend Column Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add interactive column-header sorting to the medicine mentions table in `public/index.html`, so clicking any sortable column header cycles through descending → ascending → unsorted order.

**Architecture:** Pure client-side. A new `public/sort-rows.js` exports a `sortRows(rows, sort)` function (CommonJS-exported for Jest, window-attached for the browser). `public/app.js` gains `state.sort`, calls `sortRows` after `filterRowsBySearch`, and delegates header clicks through the existing document-level click handler. Header markup in `public/index.html` uses `<button>` elements for keyboard accessibility, with `data-sort-column` attributes driving the handler and indicator glyph rendering.

**Tech Stack:** Vanilla JS (no module bundler), Jest 30 for unit tests, CSS in `public/app.css`, i18n via the existing `window.i18n` global in `public/i18n.js`.

**Spec:** `docs/superpowers/specs/2026-04-18-frontend-column-sorting-design.md`

---

## File Structure

**Create:**
- `public/sort-rows.js` — pure `sortRows` function + UMD-style export guard. Loaded in the browser before `app.js`; imported by Jest in tests.
- `__tests__/sort-rows.test.js` — unit tests for `sortRows`.

**Modify:**
- `public/index.html` — load the new script; rewrite sortable `<th>` cells as button-wrapped, attribute-tagged.
- `public/app.js` — add `state.sort`; integrate `sortRows` into `renderAnalytics`; add header-click handling; reset sort on tab switch; sync header ARIA/indicator state every render.
- `public/app.css` — styles for sortable headers, the indicator glyph slot, and `.is-sorted` active state.
- `public/i18n.js` — new keys `sort.columnLabel`, `sort.state.none`, `sort.state.asc`, `sort.state.desc`, plus column-name keys for the aria-label template (reuse existing `table.*` labels).

---

## Task 1: Create `sortRows` pure function with unit tests

**Files:**
- Create: `public/sort-rows.js`
- Create: `__tests__/sort-rows.test.js`

- [ ] **Step 1.1: Write the failing test file**

Create `__tests__/sort-rows.test.js`:

```js
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
```

- [ ] **Step 1.2: Run the test to confirm it fails**

Run: `yarn jest __tests__/sort-rows.test.js`

Expected: FAIL with `Cannot find module '../public/sort-rows.js'`.

- [ ] **Step 1.3: Create the `sortRows` implementation**

Create `public/sort-rows.js`:

```js
(function (global) {
  const NUMERIC_COLUMNS = new Set(['count1d', 'count3d', 'count30d']);

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
```

- [ ] **Step 1.4: Run the tests again to confirm they pass**

Run: `yarn jest __tests__/sort-rows.test.js`

Expected: All 9 tests pass.

- [ ] **Step 1.5: Commit**

```bash
git add public/sort-rows.js __tests__/sort-rows.test.js
git commit -m "Add sortRows pure function with tests"
```

---

## Task 2: Load `sort-rows.js` in the browser and add `state.sort`

**Files:**
- Modify: `public/index.html` (add `<script>` tag)
- Modify: `public/app.js` (add state field, wire sortRows into renderAnalytics, reset on tab switch)

- [ ] **Step 2.1: Add the script tag to `public/index.html`**

In `public/index.html`, change lines 8–10 from:

```html
<script src="/i18n.js" defer></script>
<script src="/toast.js" defer></script>
<script src="/app.js" defer></script>
```

to:

```html
<script src="/i18n.js" defer></script>
<script src="/toast.js" defer></script>
<script src="/sort-rows.js" defer></script>
<script src="/app.js" defer></script>
```

The script must load before `app.js` so that `window.sortRows` is defined when `renderAnalytics` runs.

- [ ] **Step 2.2: Add `sort` field to state**

In `public/app.js`, locate the `const state = { ... }` block (around line 185) and add a new field:

```js
const state = {
  activeView: 'tradeName',
  analytics: null,
  previousAnalytics: null,
  busy: false,
  chartBusy: false,
  chartRequestId: 0,
  chartData: null,
  lastStatusPayload: null,
  socket: null,
  socketConnected: false,
  socketReconnectTimer: null,
  openMenuKey: null,
  searchQuery: '',
  sort: { column: null, direction: null },
  selectionByView: {
    tradeName: [],
    name: [],
  },
};
```

- [ ] **Step 2.3: Call `sortRows` in `renderAnalytics`**

In `public/app.js`, inside `renderAnalytics`, find:

```js
const config = VIEW_CONFIG[state.activeView];
const allRows = getRowsForActiveView();
const searchQuery = state.searchQuery.trim();
const rows = filterRowsBySearch(allRows, searchQuery);
```

Change the last line to apply sorting after filtering:

```js
const config = VIEW_CONFIG[state.activeView];
const allRows = getRowsForActiveView();
const searchQuery = state.searchQuery.trim();
const filteredRows = filterRowsBySearch(allRows, searchQuery);
const rows = window.sortRows(filteredRows, state.sort);
```

(Note: `rows` is already referenced several times after this in the function — the rename above keeps that variable pointing to the filtered **and** sorted list, which is what we want.)

- [ ] **Step 2.4: Reset sort when switching views**

In `public/app.js`, locate the existing tab-switch handler inside the document `click` listener (around line 1114):

```js
const viewButton = event.target.closest('[data-view]');
if (viewButton) {
  state.activeView = viewButton.dataset.view;
  state.openMenuKey = null;
  syncSelection();
  renderAnalytics();
  refreshSeries();
  return;
}
```

Change it to reset `state.sort` before calling `syncSelection()`:

```js
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
```

- [ ] **Step 2.5: Smoke-check in the browser**

Run: `yarn start`

Open the dashboard. Expected: the page loads normally. The medicine table renders in backend order (as before — `state.sort.column` is still `null`). No console errors. Switching between **By trade name** and **By name** still works.

- [ ] **Step 2.6: Commit**

```bash
git add public/index.html public/app.js
git commit -m "Wire sortRows into renderAnalytics with default unsorted state"
```

---

## Task 3: Make column headers clickable in `public/index.html`

**Files:**
- Modify: `public/index.html` (table header row, lines 86–95)

- [ ] **Step 3.1: Rewrite the sortable `<th>` cells**

In `public/index.html`, replace the existing `<thead>` block (lines 86–95):

```html
<thead>
  <tr>
    <th scope="col" data-i18n="table.medicine">Medicine</th>
    <th scope="col" data-i18n="table.lastReset">Last reset date</th>
    <th scope="col" data-i18n="table.1d">1d</th>
    <th scope="col" data-i18n="table.3d">3d</th>
    <th scope="col" data-i18n="table.30d">30d</th>
    <th scope="col" class="actions-col" data-i18n="table.more">More</th>
  </tr>
</thead>
```

with:

```html
<thead>
  <tr>
    <th scope="col" class="sortable-header" data-sort-column="label" aria-sort="none">
      <button type="button" class="column-sort-button" data-sort-column="label">
        <span class="column-sort-label" data-i18n="table.medicine">Medicine</span>
        <span class="sort-indicator" aria-hidden="true"></span>
      </button>
    </th>
    <th scope="col" class="sortable-header" data-sort-column="lastResetAt" aria-sort="none">
      <button type="button" class="column-sort-button" data-sort-column="lastResetAt">
        <span class="column-sort-label" data-i18n="table.lastReset">Last reset date</span>
        <span class="sort-indicator" aria-hidden="true"></span>
      </button>
    </th>
    <th scope="col" class="sortable-header numeric-header" data-sort-column="count1d" aria-sort="none">
      <button type="button" class="column-sort-button" data-sort-column="count1d">
        <span class="sort-indicator" aria-hidden="true"></span>
        <span class="column-sort-label" data-i18n="table.1d">1d</span>
      </button>
    </th>
    <th scope="col" class="sortable-header numeric-header" data-sort-column="count3d" aria-sort="none">
      <button type="button" class="column-sort-button" data-sort-column="count3d">
        <span class="sort-indicator" aria-hidden="true"></span>
        <span class="column-sort-label" data-i18n="table.3d">3d</span>
      </button>
    </th>
    <th scope="col" class="sortable-header numeric-header" data-sort-column="count30d" aria-sort="none">
      <button type="button" class="column-sort-button" data-sort-column="count30d">
        <span class="sort-indicator" aria-hidden="true"></span>
        <span class="column-sort-label" data-i18n="table.30d">30d</span>
      </button>
    </th>
    <th scope="col" class="actions-col" data-i18n="table.more">More</th>
  </tr>
</thead>
```

Notes:
- The numeric columns (`count1d`, `count3d`, `count30d`) place the indicator **before** the label so the numeric values below stay visually aligned to the right of their header text.
- Text and date columns (`label`, `lastResetAt`) place the indicator **after** the label.
- The "More" column gets no changes — it's not sortable.
- The existing `data-i18n` key is preserved on the label `<span>` so `i18n.applyStaticTranslations()` continues to translate the column names.

- [ ] **Step 3.2: Smoke-check in the browser**

Run: `yarn start`

Open the dashboard. Expected: headers render with their translated labels (no indicator glyph visible yet — empty `<span>`). Clicking a header does nothing (handler is added in Task 5). No console errors. No layout shift compared to before.

- [ ] **Step 3.3: Commit**

```bash
git add public/index.html
git commit -m "Convert sortable column headers to accessible buttons"
```

---

## Task 4: Add CSS for sortable headers and indicator glyph

**Files:**
- Modify: `public/app.css` (append new rules near the existing `.counter-table th` rules, around line 440)

- [ ] **Step 4.1: Append the CSS rules**

In `public/app.css`, add the following block immediately after the existing `.counter-table th { ... }` rule (ending around line 440):

```css
.counter-table th.sortable-header {
  padding: 0;
}

.counter-table th.numeric-header {
  text-align: right;
}

.column-sort-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  text-align: inherit;
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease;
}

.numeric-header .column-sort-button {
  justify-content: flex-end;
}

.column-sort-button:hover {
  background: rgba(231, 183, 119, 0.18);
  color: var(--ink);
}

.column-sort-button:focus-visible {
  outline: 2px solid rgba(154, 63, 49, 0.45);
  outline-offset: -2px;
}

.sort-indicator {
  display: inline-block;
  width: 0.9em;
  min-height: 1em;
  font-size: 0.78rem;
  line-height: 1;
  color: var(--accent);
  text-align: center;
}

.counter-table th.is-sorted .column-sort-label {
  color: var(--ink);
  font-weight: 600;
}
```

- [ ] **Step 4.2: Smoke-check in the browser**

Run: `yarn start`

Open the dashboard. Expected: column headers look virtually identical to before but have a subtle hover background when the mouse is over them. Keyboard Tab lands on each sortable header button with a visible focus ring. No broken layout.

- [ ] **Step 4.3: Commit**

```bash
git add public/app.css
git commit -m "Style sortable table headers"
```

---

## Task 5: Add click handler + sync indicator state on every render

**Files:**
- Modify: `public/app.js` (add helper functions + delegated click branch + sync call in `renderAnalytics`)

- [ ] **Step 5.1: Add `cycleSort` helper**

In `public/app.js`, add the following helper immediately after `getSelectedKeys` (around line 445):

```js
function cycleSort(current, nextColumn) {
  if (!current || current.column !== nextColumn) {
    return { column: nextColumn, direction: 'desc' };
  }
  if (current.direction === 'desc') {
    return { column: nextColumn, direction: 'asc' };
  }
  return { column: null, direction: null };
}
```

- [ ] **Step 5.2: Add `syncSortIndicators` helper**

In `public/app.js`, add this function immediately after `cycleSort`:

```js
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
```

- [ ] **Step 5.3: Call `syncSortIndicators` from `renderAnalytics`**

In `public/app.js`, at the **end** of `renderAnalytics` (immediately before the final closing `}` of the function, right after the `if (openMenu) { updateMenuDirection(openMenu); }` block), add:

```js
  syncSortIndicators();
}
```

So the tail of `renderAnalytics` becomes:

```js
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
```

Also, call `syncSortIndicators()` at the start of the two early-return branches inside `renderAnalytics` (the "no rows" and "no search results" paths) — otherwise the indicator would stay stale when the table is empty. Locate:

```js
if (!allRows.length) {
  renderLoadingRow(t(config.emptyKey));
  return;
}

if (!rows.length) {
  renderLoadingRow(t('search.noResults', { query: searchQuery }));
  return;
}
```

Change to:

```js
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
```

- [ ] **Step 5.4: Add the delegated click branch**

In `public/app.js`, inside the top-level `document.addEventListener('click', (event) => { ... })`, add a new branch **before** the `const actionButton = event.target.closest('[data-action]');` check (around line 1090):

```js
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
```

Placing it before the row-click / action-button / view-button branches ensures header clicks never accidentally toggle row selection or close menus incorrectly. The `return` short-circuits the rest of the handler.

- [ ] **Step 5.5: Smoke-check in the browser**

Run: `yarn start`

Expected behavior:
- First click on **1d** header → rows sort by 1d descending, `▼` glyph appears.
- Second click on **1d** → rows sort by 1d ascending, `▲` glyph appears.
- Third click on **1d** → indicator disappears, rows revert to backend order.
- Clicking **Medicine** while **1d** is sorted → **1d** glyph clears, **Medicine** shows `▼` (desc).
- Clicking **Last reset date**: rows with `—`/`No baseline` stay at the bottom both ways.
- Switching between **By trade name** and **By name** resets sort (all indicators clear).
- Live WebSocket updates do not disturb the current sort.
- Keyboard: Tab to a header, press Space/Enter → same cycle. Focus ring visible.

- [ ] **Step 5.6: Commit**

```bash
git add public/app.js
git commit -m "Wire column-header click handler and indicator sync"
```

---

## Task 6: Add i18n keys for sort accessibility labels

**Files:**
- Modify: `public/i18n.js` (add four new keys to all three language dictionaries)

- [ ] **Step 6.1: Add keys to the Russian dictionary**

In `public/i18n.js`, inside the `ru:` dictionary, add the following lines (group them with the other short labels — near the existing `'table.more'` key is a sensible spot):

```js
'sort.columnLabel': 'Сортировка по «{column}», сейчас: {state}',
'sort.state.none': 'не отсортировано',
'sort.state.asc': 'по возрастанию',
'sort.state.desc': 'по убыванию',
```

- [ ] **Step 6.2: Add keys to the `uz-Cyrl` dictionary**

In the `'uz-Cyrl':` dictionary, add:

```js
'sort.columnLabel': '«{column}» бўйича сортировка, ҳозир: {state}',
'sort.state.none': 'сортировка йўқ',
'sort.state.asc': 'ўсиш бўйича',
'sort.state.desc': 'камайиш бўйича',
```

- [ ] **Step 6.3: Add keys to the `uz-Latn` dictionary**

In the `'uz-Latn':` dictionary, add:

```js
'sort.columnLabel': '«{column}» bo‘yicha sortlash, hozir: {state}',
'sort.state.none': 'sortlanmagan',
'sort.state.asc': 'o‘sish bo‘yicha',
'sort.state.desc': 'kamayish bo‘yicha',
```

- [ ] **Step 6.4: Smoke-check the aria-label**

Run: `yarn start`

In the browser devtools, inspect a `.column-sort-button` element after the page loads. Expected: its `aria-label` reads (in Russian) something like `Сортировка по «1 дн.», сейчас: не отсортировано`. After one click on that header, the aria-label becomes `Сортировка по «1 дн.», сейчас: по убыванию`.

Also switch the language dropdown to each of the three options and confirm the `aria-label` updates on the next render (the language-change handler already calls `renderAnalytics()`, which calls `syncSortIndicators()` — so no extra wiring is needed).

- [ ] **Step 6.5: Commit**

```bash
git add public/i18n.js
git commit -m "Add i18n keys for sort button aria-labels"
```

---

## Task 7: End-to-end manual verification

**Files:** None (verification only)

- [ ] **Step 7.1: Run the full test suite**

Run: `yarn test`

Expected: all tests pass, including the new `sort-rows.test.js`.

- [ ] **Step 7.2: Manual checklist in the browser**

Run: `yarn start`

Run through each of these in order and confirm behavior:

1. Page loads — medicine table renders in backend order, no indicators visible.
2. Click **1d** header → desc, `▼` shown, biggest-first.
3. Click **1d** again → asc, `▲`, smallest-first.
4. Click **1d** a third time → unsorted, glyph gone, rows revert to backend order.
5. Click **Medicine** → desc (Z→A).
6. Click **Medicine** again → asc (A→Z).
7. Click **Last reset date** → desc; rows with no baseline pinned to the bottom.
8. Click **Last reset date** again → asc; rows with no baseline still at the bottom.
9. Click **3d** then **30d** — only one column's indicator is visible at a time.
10. With **1d desc** active, type a search query — results are filtered AND sorted.
11. With **1d desc** active, click the **By name** tab — sort resets, no indicator visible.
12. With **1d desc** active, reload the page — sort resets.
13. Keyboard: Tab focuses each header button in order, visible focus ring, Space/Enter triggers the same cycle.
14. Switch language to Uzbek (Cyrl), then Uzbek (Latn) — header labels re-translate; aria-labels on buttons reflect the new language.
15. Live WebSocket updates (wait ~15s or trigger a reset on a row) — incoming data rerenders but the current sort selection sticks.

- [ ] **Step 7.3: Commit (only if any polish changes were needed)**

If Step 7.2 surfaced any issues requiring small fixes, commit them with a short message describing the fix. Otherwise, no commit is needed — the feature is complete.

---

## Self-Review Notes (already applied)

- **Spec coverage:** Every spec section maps to a task:
  - *User-facing behavior + three-state cycle* → Tasks 3, 5 (handler cycles; indicators).
  - *Default state, persistence, tab-switch reset* → Task 2 (state init, tab-switch handler).
  - *Sort semantics per column + null handling + stability* → Task 1 (`sortRows` + tests).
  - *Visual design + numeric-column alignment* → Tasks 3, 4 (HTML + CSS).
  - *Accessibility (aria-sort, button, aria-label)* → Tasks 3, 5, 6.
  - *Testing (unit + manual)* → Tasks 1, 7.
- **No placeholders:** Every code step shows the exact code; every command has expected output.
- **Type/name consistency:** `sortRows`, `cycleSort`, `syncSortIndicators`, `state.sort`, `data-sort-column`, `.sort-indicator`, `.column-sort-button`, `.sortable-header`, `.numeric-header`, `.is-sorted`, `column-sort-label` — used consistently across HTML, CSS, and JS.
- **Open risk called out in spec:** testability of `public/app.js`. Resolved here by putting the pure function in its own file (`public/sort-rows.js`) with a UMD-style export — no bundler, no refactor of `app.js` required.
