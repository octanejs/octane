---
"octane": patch
---

Fix effect/ref cleanup leak on the keyed-list batch-clear fast path.

Clearing a keyed `@for` list (or replacing every key at once) tears down items through
`batchClearItems`, which previously fired only each item scope's own `cleanups` and
`children` — gated behind a `hasCleanups` flag that only `useEffect` registration set.
Cross-module component rows (a `componentSlot` stashed on the item's `_slots`, not
`.children`) never had their effect cleanups fired, cleanup-returning callback refs
leaked whenever the row had no effects, and portal content in foreign targets was left
in the DOM. Items now dispose through the full `unmountBlock(b, false)` scope walk
(slots, portals, trySlot bookkeeping) whenever they carry any teardown work, with plain
template rows keeping the cheap fast path. The scattered per-item removal path was
always correct; only bulk clear/replace leaked. Teardown walks also now traverse the
intrusive item chain (`head` → `nextSibling`) instead of the keyed Map's iterator.
