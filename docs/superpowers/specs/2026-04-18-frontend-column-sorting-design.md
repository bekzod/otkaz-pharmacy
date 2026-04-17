# Frontend Column Sorting — Design

**Date:** 2026-04-18
**Scope:** Add interactive column-header sorting to the medicine mentions table in the web dashboard (`public/index.html`, `public/app.js`, `public/app.css`). Purely client-side; no backend changes.

## Goal

Let the user sort the medicine mentions table by any column by clicking the column header, so they can find "most mentioned today", "alphabetical", or "oldest reset first" without scanning an unordered list.

## User-facing behavior

### What's clickable

Every column header in `#medicine-table-body`'s enclosing table becomes clickable:

- **Medicine** (column `label`)
- **Last reset date** (column `lastResetAt`)
- **1d** (column `count1d`)
- **3d** (column `count3d`)
- **30d** (column `count30d`)

The **More** column (actions) is not sortable.

### Three-state cycle per header

Clicking a header cycles through:

1. **unsorted** (initial)
2. **descending** — first click
3. **ascending** — second click
4. **unsorted** — third click (rows revert to backend order)

Descending is the first-click state because for numeric columns it matches the dominant user intent ("show me the biggest first"). The same cycle applies to the text and date columns for consistency.

Only one column can be active at a time. Clicking a different header resets the previously-active one to unsorted and starts a new cycle on the new column at **descending**.

### Default state

On page load the sort is `{ column: null, direction: null }` — rows render in the order the backend returns (no client-side reordering).

### Persistence

**None.** The sort state lives only in `state.sort` in-memory. It resets:

- On every page reload.
- When the user switches tabs between **By trade name** and **By name** (handled in the existing tab-switch handler alongside the `syncSelection()` call).

The search query and selection have their own persistence rules; sort does not change them.

### Interaction with search

The existing search filter (`filterRowsBySearch`) runs first; sort is applied to the filtered result. This keeps behavior predictable: what you see is always `filter(allRows) → sort(filtered)`.

### Interaction with live updates

WebSocket/`refreshDashboard` updates replace `state.analytics` but leave `state.sort` untouched, so incoming data is rendered with the user's current sort applied. The existing change-detection / value-flash logic in `renderAnalytics` keeps working because it compares by row `key`, independent of display order.

## Sort semantics per column

| Column            | Field          | Comparator                                                                                       |
| ----------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| Medicine          | `label`        | `Intl.Collator(currentLang, { sensitivity: 'base', numeric: true }).compare(a.label, b.label)`   |
| Last reset date   | `lastResetAt`  | Timestamp compare via `new Date(value).getTime()`. Nulls always sink to the bottom (see below).  |
| 1d / 3d / 30d     | `count1d` etc. | Numeric compare on `Number(value \|\| 0)`.                                                       |

### Null handling

- `lastResetAt` is the only field that is legitimately null (rows without a baseline).
- Rows with null `lastResetAt` always sort **below** rows with a timestamp, regardless of ascending/descending. This matches the existing visual treatment of `muted-cell` / `row.noBaseline`.
- For count columns, any non-numeric value coerces to `0`.

### Stability

The sort must be stable: ties preserve the backend-provided order. Implementation uses `Array.prototype.sort` on a shallow copy, which is stable in all modern browsers — no extra key needed.

## Visual design

### Header affordance

Each sortable `<th>` becomes visually clickable:

- `cursor: pointer` on hover.
- A small `<span class="sort-indicator" aria-hidden="true">` slot lives inside the header, reserving space so the header width doesn't jump when the indicator appears.
- Indicator glyphs: `▼` (descending), `▲` (ascending), empty (unsorted).
- Only the currently active column shows a glyph; inactive columns show nothing.
- An `.is-sorted` class on the active `<th>` can be styled subtly (slightly bolder label) — optional polish.

### Numeric column alignment

The indicator for right-aligned numeric columns (`1d`, `3d`, `30d`) sits to the **left** of the header label so the numeric values underneath stay visually clean. The text/date columns put the indicator on the right of the label.

### Accessibility

- Each sortable `<th>` gets `aria-sort="none" | "ascending" | "descending"`, updated on every render.
- Each `<th>` contains a semantic `<button type="button" class="column-sort-button">` so keyboard users can focus and activate with Space/Enter. The button wraps the label text and indicator.
- The button has an `aria-label` that reads the full state, e.g. "Sort by 1-day count, currently unsorted" — driven by a new i18n key `sort.columnLabel`.

## Implementation plan

### State

New field on `state`:

```js
sort: { column: null, direction: null }
// column: 'label' | 'lastResetAt' | 'count1d' | 'count3d' | 'count30d' | null
// direction: 'asc' | 'desc' | null
```

### New pure function

In `public/app.js`:

```js
function sortRows(rows, { column, direction }) { ... }
```

- Returns the input array unchanged when `column` is null.
- Otherwise returns a new array sorted per the comparator table above.
- Null-sink rule for `lastResetAt` applied inside.
- Locale-aware collator for `label`, built once per call using `window.i18n.getLang()`.

### Integration point

Inside `renderAnalytics`:

```js
const filtered = filterRowsBySearch(allRows, searchQuery);
const rows = sortRows(filtered, state.sort);
```

This is the only place `rows` is computed before iteration; all downstream logic is unchanged.

### Click handler

Extend the existing top-level `document.addEventListener('click', ...)`:

- Detect `event.target.closest('[data-sort-column]')`.
- If found: compute the next `state.sort` via a `cycleSort(current, clickedColumn)` helper and call `renderAnalytics()`. Do **not** call `refreshSeries()` — the chart depends on selection, not order.
- Respect existing menu-close logic: a header click should not accidentally toggle row selection. Order the handler blocks so that the header-click case returns early.

### Tab switch reset

In the existing `viewButton` branch of the click handler, add:

```js
state.sort = { column: null, direction: null };
```

before `syncSelection()`, so switching between `tradeName` / `name` returns to backend order.

### HTML changes (`public/index.html`)

Replace each sortable `<th>` with a button-containing structure, for example:

```html
<th scope="col" data-sort-column="count1d" aria-sort="none">
  <button type="button" class="column-sort-button" data-sort-column="count1d">
    <span class="sort-indicator" aria-hidden="true"></span>
    <span data-i18n="table.1d">1d</span>
  </button>
</th>
```

The `data-sort-column` attribute is duplicated on both the `<th>` (for the CSS `.is-sorted` selector and `aria-sort`) and the button (for the click delegation). `renderAnalytics` updates the `<th>` attributes and indicator glyph on every render, driven by `state.sort`.

### CSS changes (`public/app.css`)

- `.column-sort-button`: resets default button chrome (background, border), matches existing header typography, full-width so the whole cell is clickable.
- `.sort-indicator`: fixed-width slot (approx. `0.75em`) so column widths don't shift.
- `.counter-table th.is-sorted` / `.sort-indicator[data-direction="asc"|"desc"]` for the active-state styling.
- `cursor: pointer` on sortable headers.

### i18n keys

Add to each language dictionary in `public/i18n.js`:

- `sort.columnLabel` — template like `"Sort by {column}, currently {state}"`.
- `sort.state.none`, `sort.state.asc`, `sort.state.desc`.

### Testing

- **Manual**: verify all five columns sort correctly in both directions; verify third click returns to backend order; verify null `lastResetAt` rows always bottom; verify tab switch resets; verify reload resets; verify search + sort compose; verify keyboard activation.
- **Automated**: add a unit test for `sortRows` covering: no-op when column null, desc/asc for numeric, asc/desc for label, null-sink for `lastResetAt`, stability with tied values. Test file: `__tests__/sort-rows.test.js`, using the same Jest setup as the rest of the suite. The function will need to be exported from `public/app.js` (or extracted into a small module the page can `<script>`-include) — implementation plan will pick the cleanest split given how the file is loaded today.

## Out of scope (YAGNI)

- Multi-column / tie-breaker sort.
- Dedicated "clear sort" UI button (the three-state cycle handles it).
- Server-side sorting or sort-aware pagination.
- Persisting sort across reloads, tabs, or sessions.
- Sorting the `More` column or any column that doesn't yet exist.
- Applying sort on the ignored-texts page (`public/ignored-texts.*`) — not part of this request.

## Open questions

None at spec-freeze time. If the unit test extraction reveals that `public/app.js` needs to be split into modules for testability, the implementation plan will call out the exact split before changing the HTML script tags.
