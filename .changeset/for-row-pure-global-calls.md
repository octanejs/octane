---
'octane': patch
---

An `@for` row that converts a value with an unshadowed standard global, such as `{String(row.id)}` or `data-n={Number(row.n)}`, now keeps every keyed-list fast path. Before, the call counted as opaque render work, so rows were never skipped on parent renders, the whole-list cache and keyed-selection update were off, and server rendering kept a per-row identity wrapper. In the js-framework benchmark, a row migrated from React with `String(item.id)` text selected 28× slower than the hand-written fixture (313× for 10,000 rows); it now matches it. A binding named `String` anywhere in scope, or a call whose arguments do opaque work, still keeps the row live. A row that reads a standard global value such as `undefined` or `Math.PI` now also gets the whole-list cache, which already skipped its unchanged rows individually.
