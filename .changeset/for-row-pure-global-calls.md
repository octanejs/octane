---
'octane': patch
---

An unshadowed call to a standard conversion global, such as `{String(row.id)}` or `label={Number(value)}`, no longer counts as opaque render work. It now keeps every compiler fast path the bare value gets:

- keyed `@for` rows: survivor skips, the whole-list cache, the keyed-selection update, the direct host mount, and server rendering without a per-row identity wrapper;
- component and call-site memo regions, and lite component edges;
- cached calculations.

In the js-framework benchmark, a row migrated from React with `String(item.id)` text selected 28× slower than the hand-written fixture (313× for 10,000 rows); it now matches it.

A binding named `String` anywhere in scope, or a call whose arguments do opaque work, still keeps the code live.

A row that reads a standard global value such as `undefined` or `Math.PI` now also gets the whole-list cache. It already skipped its unchanged rows individually.
