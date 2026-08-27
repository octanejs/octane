# Store selector fan-out

512 independently rendered subscribers read one external store **through a
selector**, in production-built Octane, React, Preact, Solid 2, Svelte, Vue
Vapor, and Inferno applications. The measured operation is the one a selector layer is
supposed to make free: **unrelated parent re-renders while the store is
untouched**.

`external-store-fanout` is the sibling suite for a raw `useSyncExternalStore`
fan-out with an inline snapshot getter and no selector layer at all;
`external-store-integrations` measures real Zustand/Jotai/TanStack Query
backends. Neither isolates the cost of the selector itself, which is what this
suite exists for.

## Why the shape is what it is

Octane, React, and Preact use the `use-sync-external-store/with-selector` shape:
a cached read, memoized on the **selector's identity**, wrapped in
`useSyncExternalStore`. That is the shape a selector argument's identity
actually matters in — a selector reallocated on every render throws the cache
away, so each subscriber redoes a selection whose inputs never moved. Solid,
Inferno caches the selected total in native class state and recomputes it only
from its store subscription. Solid, Svelte, and Vue have no render pass to redo,
so their subscribers express the same thing as a `createMemo` / `$derived` /
`computed` over a snapshot signal.

The store publishes an **immutable snapshot** whose identity changes only on a
write, which is what lets a selection be reused across renders at all. The
selection reduces a 2,000-element array, large enough that eliminating it is
visible above real-browser noise; every framework's selector calls the same
shared reduction, so the work per invocation is identical and only the
invocation **count** can differ.

Each subscriber also takes a parent-owned `generation` prop and renders it as
`data-generation`, so a parent re-render genuinely reaches all 512 subscribers
instead of being absorbed by a memo boundary.

## Diagnostics

`selectorCallsDuringRerenders` is the deterministic signal: the store does not
move during the burst, so every one of those calls is work a stable selector
would not have done. Read it next to `subscriberRendersDuringRerenders` and
`snapshotCallsDuringRerenders` — on a render-pass framework those stay at
512 × 20, so a zero selector count means the selection was **reused**, not that
the renders were skipped. `subscribeCalls`/`unsubscribeCalls`, `notifications`,
and `retainedSubscribers` gate teardown.

Real Chromium also gates the semantics directly: every subscriber must show the
correct total after each broad write, and must still show it — with the new
generation — after the re-render burst. A second write after the burst proves
subscriptions established before it still deliver.

```bash
node benchmarks/bench.mjs --quick store-selector-fanout
node benchmarks/bench.mjs store-selector-fanout
```
