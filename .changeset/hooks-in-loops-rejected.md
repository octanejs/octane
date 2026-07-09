---
'octane': patch
---

The compiler now rejects slot-keyed hooks inside plain JS loops (`for`,
`for…in`, `for…of`, `while`, `do…while`). Hooks are keyed by a per-call-site
slot, so every iteration of a loop shared the ONE slot assigned to that call
site — `useState` silently shared a single state cell across iterations,
`useMemo` recomputed every iteration with only the last entry surviving, and
slot-keyed effects collided the same way. This was always documented as
rejected; the check now exists, with a diagnostic pointing at the supported
forms: the keyed `@for` template directive (each item renders in its own scope,
so per-item hooks get per-item state) or extracting the loop body into a child
component. `use()` and `useContext` are exempt (call-order / context-identity
keyed, not slot-keyed) and keep working in loops, as do hooks behind a nested
function boundary (local components, deferred callbacks).
