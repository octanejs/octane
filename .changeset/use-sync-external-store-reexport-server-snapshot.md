---
'octane': patch
---

`useSyncExternalStore` now reads `getServerSnapshot` when it is imported through another module,
such as a binding that re-exports it. The compiler calls such an import without a trailing hook
slot, so both runtimes took the server snapshot for the slot: server rendering used
`getSnapshot`, and hydration read the client snapshot and regenerated the server markup.
