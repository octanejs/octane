# External-store integrations

Compare 512 real browser subscribers backed by actual Zustand vanilla stores,
Jotai atoms, and TanStack Query caches. Each of the seven frameworks uses its
native subscriber lifecycle over the same framework-independent production
store core. Chromium checks narrow selectors, full fan-out, rapid updates,
and exact subscription teardown for all three libraries. TanStack Query
invalidation is measured separately and must run a real query refetch, update
the cached snapshot, notify subscribers, and change the visible UI.

```bash
node benchmarks/bench.mjs --quick external-store-integrations
node benchmarks/bench.mjs external-store-integrations
```
