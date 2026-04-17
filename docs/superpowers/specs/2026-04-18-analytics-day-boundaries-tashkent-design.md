# Anchor analytics day boundaries to Asia/Tashkent (GMT+5)

## Problem

Analytics counters and chart buckets in `src/server/medicineAnalyticsService.js` currently align to UTC. For users in Uzbekistan (GMT+5, no DST), this means:

- "Today's count" (`count_1d`) is a rolling 24-hour window — not a calendar day at all.
- Chart daily buckets roll over at 00:00 UTC = 05:00 Tashkent, so messages received between 00:00–05:00 Tashkent get attributed to the previous day in the UI.

The counters should reflect Tashkent calendar days.

## Scope

Change day-boundary semantics for all four counters and for chart buckets. Out of scope: the 90-day pre-filter used for index pruning (`windowStart`, line 492), which is not user-visible.

## Changes

### 1. Timezone constant

Add at the top of `src/server/medicineAnalyticsService.js`:

```js
const ANALYTICS_TZ = 'Asia/Tashkent';
```

Use the IANA name (not `+05:00`) so intent is explicit. The constant is interpolated into SQL as a literal — safe because it is build-time and never user-derived.

### 2. Counter semantics (`buildDimensionQuery`, lines 246–269)

Replace rolling windows with Tashkent calendar-day windows:

| Counter | New meaning |
|---|---|
| `count_1d` | entries since today 00:00 Tashkent (1 calendar day incl. today) |
| `count_3d` | entries since (today − 2 days) 00:00 Tashkent (3 calendar days) |
| `count_30d` | entries since (today − 29 days) 00:00 Tashkent (30 calendar days) |
| `count_90d` | entries since (today − 89 days) 00:00 Tashkent (90 calendar days) |

Implementation: replace

```sql
CAST(:now AS timestamptz) - INTERVAL 'N days'
```

with

```sql
(date_trunc('day', CAST(:now AS timestamptz) AT TIME ZONE '${ANALYTICS_TZ}')
   AT TIME ZONE '${ANALYTICS_TZ}') - INTERVAL 'N-1 days'
```

The `AT TIME ZONE` pair converts the UTC instant to Tashkent wall time, floors to midnight, and converts back to a UTC instant — giving the exact UTC moment corresponding to Tashkent midnight for the current Tashkent date.

Use `INTERVAL '0 days'` for `count_1d` (just today), `INTERVAL '2 days'` for `count_3d`, etc.

### 3. Chart daily buckets (`buildSeriesQuery`, line 352)

Change:

```sql
CAST(re.event_at AS date) AS day
```

to:

```sql
CAST(re.event_at AT TIME ZONE '${ANALYTICS_TZ}' AS date) AS day
```

This shifts the UTC instant to Tashkent wall time before casting to date, so a message at 23:30 UTC on April 17 buckets as April 18 (Tashkent).

### 4. Series window bounds (`getSeries`, lines 540–542)

Remove `startOfUtcDay` / `addUtcDays` from the series calculation and compute the window in SQL. Pass `:now` as the current instant; Postgres derives `seriesEnd` and `seriesStart`:

```sql
WITH bounds AS (
  SELECT
    (date_trunc('day', CAST(:now AS timestamptz) AT TIME ZONE '${ANALYTICS_TZ}')
      AT TIME ZONE '${ANALYTICS_TZ}') AS series_end_ts,
    (date_trunc('day', CAST(:now AS timestamptz) AT TIME ZONE '${ANALYTICS_TZ}')
      AT TIME ZONE '${ANALYTICS_TZ}') - INTERVAL '89 days' AS series_start_ts
),
day_series AS (
  SELECT generate_series(
    CAST((SELECT series_start_ts FROM bounds) AT TIME ZONE '${ANALYTICS_TZ}' AS date),
    CAST((SELECT series_end_ts FROM bounds) AT TIME ZONE '${ANALYTICS_TZ}' AS date),
    INTERVAL '1 day'
  )::date AS day
)
```

Replace the `:seriesStart` / `:seriesEnd` replacement placeholders and their uses (lines 300, 316, 344–347, 359) with references to the CTE. Replacement object in `getSeries` becomes `{ dimension, keys, now: activeNow.toISOString() }`.

The returned `startDate` / `endDate` strings in the response payload (lines 586–587) are computed from the same Tashkent-midnight instants — derive them in JS by formatting `activeNow` in Tashkent (`Intl.DateTimeFormat('en-CA', { timeZone: ANALYTICS_TZ })` gives `YYYY-MM-DD`) and subtracting 89 days from that date.

Add a helper:

```js
function tashkentDateString(instant) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ANALYTICS_TZ }).format(instant);
}
```

Compute `endDate = tashkentDateString(activeNow)` and `startDate` = endDate minus 89 days (string arithmetic on `YYYY-MM-DD`, or construct a Date from endDate at noon UTC and subtract days — noon avoids any DST edge even though Tashkent has none).

### 5. Frontend label formatter (`public/app.js:481–488`)

Current `formatShortDate` parses the day as UTC midnight then formats via `toLocaleDateString` with no `timeZone` option, so a viewer outside GMT+5 sees labels shifted by a day. Since the server now emits Tashkent-anchored `YYYY-MM-DD`, the formatter must render in Tashkent too:

```js
function formatShortDate(value) {
  if (!value) return '';
  const parsed = new Date(`${value}T00:00:00+05:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('ru-RU', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Tashkent',
  });
}
```

Using the offset `+05:00` in the parsed string is fine here — no DST applies.

### 6. Leave unchanged

- `windowStart` 90-day rolling pre-filter (line 492): purely an index-pruning bound. A few hours of slop does not affect counters, which are re-bounded downstream.
- The similar 90-day filter at line 409.
- `startOfUtcDay` / `addUtcDays` helpers (lines 94–102): still used elsewhere; leave in place unless they become unused after change 4. If unused, remove them.

## Tests

Update `__tests__/medicine-analytics-service.test.js`:

- Given `nowValue = '2026-04-18T10:00:00Z'` (15:00 Tashkent), an entry at `2026-04-17T23:30:00Z` (04:30 Tashkent on April 18) should count toward `count_1d`. Under the old UTC-rolling behavior it would count as "yesterday" for day bucketing.
- An entry at `2026-04-17T18:00:00Z` (23:00 Tashkent on April 17) should NOT count toward `count_1d` but should count toward `count_3d`.
- Series: the same entries should bucket to `2026-04-18` and `2026-04-17` respectively in the `points[].date` output.
- `startDate` / `endDate` in the series response reflect Tashkent dates.

## Migration / rollout

Pure read-path change — no data migration, no schema change, no API shape change (field names and types identical). The only user-visible difference is that same-day counters and chart day labels shift by up to 5 hours' worth of events.
