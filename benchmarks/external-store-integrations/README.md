# External-store integrations

Compare 512 real browser subscribers backed by actual Zustand vanilla stores,
Jotai atoms, and TanStack Query caches. Each of the six frameworks uses its
native subscriber lifecycle over the same framework-independent production
store core. Chromium checks narrow selectors, full fan-out, rapid updates,
TanStack Query invalidation, and exact subscription teardown for all three
libraries.

```bash
node benchmarks/bench.mjs --quick external-store-integrations
node benchmarks/bench.mjs external-store-integrations
```
