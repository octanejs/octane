---
'octane': patch
---

Journal a structural slot change with one fewer Map, closure and log entry. Before a root render restructures an `@if`, `@switch`, component or child slot, it records the slot so that a suspension can roll it back. That record now marks the slot's snapshot instead of keeping a second Map with an undo closure to clear it. Rollback is unchanged.

On the `portal-swarm` benchmark, opening and closing all 600 tooltips allocates 6.6% less (3,111 KB to 2,906 KB), and `open_close_cycle` runs 1–2% faster (paired, A/A-controlled). Bundles that include the root journal lose 16–22 raw bytes.
