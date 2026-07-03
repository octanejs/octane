# effectful-list bench — octane (TSRX vs JSX) vs react vs solid vs ripple

A sibling of [`js-framework`](../js-framework/) and [`dbmon`](../dbmon/) that
measures what those suites deliberately avoid: **the per-row effect/ref
lifecycle machinery**. Same 1k-row keyed-table shape as js-framework, but every
row is a CROSS-MODULE `Row` component carrying:

- `useEffect(() => { fx.mounts++; return () => { fx.cleanups++; }; }, [item.id])`
  — a cleanup-bearing passive effect that fires once per keyed-row lifetime;
- `useLayoutEffect(() => { if (item.probe) { fx.h += cell.offsetHeight; fx.layouts++; } }, [item.value])`
  — a layout effect keyed on the row's value, whose layout read happens **only
  on every 10th row** (a full-table layout force per sample would drown the
  framework delta in reflow cost);
- a **SHARED module-level callback ref that returns a cleanup**
  (`rowRef = (el) => { fx.refs++; return () => { fx.refCleanups++; }; }`) —
  one function identity across all 1000 rows, React-19-style ref-cleanup
  semantics;
- one text hole per cell (`{item.label as string}` / `{item.value}`).

The parent holds `items` plus an **unrelated `tick` state**, so one op can
re-render every row body while every effect deps-array stays unchanged.

## Why these numbers are actionable

This suite is the standing regression guard for octane's effect subsystem —
costs that js-framework's effect-free rows never touch:

- **drainPhase splice+sort** — the effect-queue drain that orders and runs
  queued effect records per commit (`mount_1k`, `clear`, `remount`);
- **compareEffectPostOrder ancestor walks** — the ordering comparator's block
  ancestry walks, stressed by 1000 sibling rows each contributing effects;
- **per-(ref,element) cleanup WeakMaps** — `attachRef`'s bookkeeping for a
  single shared callback-ref identity attached to 1000 elements
  (`mount_1k`/`clear`/`remount` churn it; `update_nodeps` must NOT touch it);
- **deps-array `Object.is` churn** — `update_nodeps` re-invokes 1000 row
  bodies whose every hook bails on unchanged deps: the pure
  re-render + deps-diff overhead.

A regression in `clear`/`remove_100_scattered` with a flat `mount_1k` points
at the teardown path (cleanup ordering, ref-cleanup maps); a regression in
`update_nodeps` with flat everything-else points at deps diffing / hook-slot
re-render overhead; a regression in `update_deps` isolates layout-effect
cleanup+refire dispatch.

## Layout

```
benchmarks/effectful-list/
├── octane-tsrx/   # Vite app, dev :5201 — octane authored in .tsrx (@for + class)
├── octane-jsx/    # Vite app, dev :5202 — same app in React-style .tsx (map + className)
├── react/         # Vite app, dev :5203 — React 19, production mode; Row hook code
│                  #   IDENTICAL to octane-jsx's (only the import source differs)
├── solid/         # Vite app, dev :5204 — Solid 2.0: createStore + reconcile + <For>
├── ripple/        # Vite app, dev :5205 — ripple: track + keyed @for + effect()
├── run.mjs        # Playwright harness — gates + timings
├── package.json   # umbrella: `pnpm bench`
└── README.md
```

All five apps share the same `data.js` (seeded mulberry32 item factory) and
`ops.js` (module-scope current-array driver) verbatim, so every target renders
byte-identical content for the same op sequence.

## Ops and the correctness gate

| op                     | transition                    | expected `__fx` delta (gate)                                 |
| ---------------------- | ----------------------------- | ------------------------------------------------------------ |
| `mount_1k`             | empty → 1000 fresh rows       | mounts 1000, refs 1000, layouts 100, h > 0                    |
| `update_nodeps`        | bump unrelated `tick`         | **all zero** — rows re-render (VDOM targets), no effect fires |
| `update_deps`          | bump every `item.value`       | layouts 100 (1000 layout refires, 100 probe reads), h > 0     |
| `clear`                | 1000 → 0                      | cleanups 1000, refCleanups 1000                               |
| `remount`              | 1000 → 1000 all-new keys      | mounts+cleanups 1000, refs+refCleanups 1000, layouts 100      |
| `remove_100_scattered` | drop every 10th row           | cleanups 100, refCleanups 100                                 |

The gate is **load-bearing**: before timing each op the harness resets the
counters, applies the op once, and requires the exact deltas above (plus the
`tbody tr` count). A fixture whose effects over- or under-fire would silently
measure the wrong workload. The gate runs **per-op**: an op whose gate fails is
flagged (`GATE FAIL` in the table, `meta.fxGate: "fail"` + `fxGateFailures` in
`BENCH_JSON`) and its timing is skipped, but every OTHER op and target still
produces numbers — so one broken transition can't blank out the whole run. If
ANY gate failed the harness still exits 1 and writes `BENCH_JSON` with a
top-level `failed` reason (the contract). Counters are reset between ops.

> **Known octane bug (as of this writing): `clear` and `remount` gates FAIL on
> both octane targets.** When a keyed `@for` list of cross-module `<Row/>`
> components is cleared to empty (`clear`) or fully replaced with all-new keys
> (`remount`), octane fires **zero** effect/ref cleanups (`cleanups` and
> `refCleanups` stay 0 instead of 1000) — a genuine effect/ref-cleanup **leak**
> on the bulk-teardown fast path. It reproduces only on the batch-clear path:
> the per-item reconcile teardown is correct, which is why `remove_100_scattered`
> (100 scattered unmounts with 900 survivors) passes with `cleanups`/`refCleanups`
> = 100. Root cause is `fireCleanupsOnly` in `packages/octane/src/runtime.ts`
> (the `batchClearItems` disposal path): it recurses only into `scope.children`
> and never walks `scope._slots`, so a row's slot-stashed child block (a
> cross-module component rendered via `componentSlot`, and by extension nested
> portals/control-flow) has its cleanups skipped. `unmountScope` (the per-item
> path) walks `_slots` correctly. The fixtures are authored faithfully and are
> NOT worked around — the failing gates are the intended regression signal and
> will auto-pass once the runtime walks `_slots` in `fireCleanupsOnly` (and its
> `b.cleanups.length || b.children.length` call-guard in `batchClearItems`
> accounts for `_slots`). react / solid / ripple pass all six gates.

`clear` is specifically the path js-framework's `clear` skips: there, teardown
of effect-free rows is pure DOM removal; here every removed row runs a passive
cleanup **and** a ref cleanup.

## Methodology notes

- Effects deliberately count via **plain counter mutations** (`fx.mounts++`),
  never setState — so counting cannot schedule renders and the timed window
  stays pure.
- **Timed window includes effect dispatch.** React 19 flushes passive effects
  synchronously at the tail of a sync-lane commit, so its `flushSync`-wrapped
  ops already include useEffect work. Octane's `flushSync` intentionally
  defers passives to the post-paint scheduler (React-18-era parity), so the
  octane fixtures call the public `drainPassiveEffects()` right after
  `flushSync` — inside the timed window — to keep the comparison like-for-like
  and the gates deterministic. Solid ops call `flush()`; ripple ops go through
  `flushSync`.
- `update_nodeps` is **meaningfully octane-vs-react only**: fine-grained
  frameworks (solid, ripple) don't re-render row bodies on an unrelated parent
  signal, so their column is ~the cost of one text-node update. It's kept for
  all five targets because the gate (zero effect fires) is still a correctness
  statement about each framework.
- Sub-millisecond ops (`update_nodeps`, `update_deps`) run a ×10 inner loop
  inside the timed window and divide, to beat timer quantization.
- Framework-equivalence adaptations (all preserve the analytic counter
  expectations):
  - **solid** has no `onMount` in 2.0 — the mount count uses an effect with an
    empty compute (runs its untracked effect phase once, post-mount) plus
    `onCleanup` in the row body. Solid 2.0 ref callbacks ignore returned
    cleanups **and run OUTSIDE any reactive owner** (`getOwner()` is null at
    ref-call time), so a bare `onCleanup` inside the shared `rowRef` would
    no-op. The faithful equivalent captures each row's owner in the Row body
    (`setRowOwner(getOwner())`) and the shared `rowRef` registers its cleanup
    on THAT owner via `runWithOwner` — still exactly once per row disposal,
    keyed to the correct per-row owner (verified by the `remove_100_scattered`
    gate). Rows come from `createStore` + `reconcile(next, 'id')` (the dbmon
    pattern) so the shared immutable-array ops driver preserves row identity
    for same-id rows.
  - **ripple** has no layout/passive split and no deps arrays — the
    mount/cleanup effect reads nothing tracked (runs once per row block; its
    returned teardown is the cleanup), and the layout-read effect depends on
    the row's `item` binding, which the ops driver only replaces when `value`
    actually changes. Ripple function refs support the cleanup-return.

## Running

Start the five preview servers (production builds), then run the harness:

```bash
# build + preview each (production); run from the repo root
pnpm --filter octane-tsrx-effectful-list-bench build && pnpm --filter octane-tsrx-effectful-list-bench preview &
pnpm --filter octane-jsx-effectful-list-bench  build && pnpm --filter octane-jsx-effectful-list-bench  preview &
pnpm --filter react-effectful-list-bench       build && pnpm --filter react-effectful-list-bench       preview &
pnpm --filter solid-effectful-list-bench       build && pnpm --filter solid-effectful-list-bench       preview &
pnpm --filter ripple-effectful-list-bench      build && pnpm --filter ripple-effectful-list-bench      preview &

# then, from benchmarks/effectful-list:
pnpm bench           # 30 timed iterations (+10 warmup) per op
pnpm bench:long      # 50 iterations
node run.mjs 3       # reduced-iteration smoke pass
```

Swap `build && … preview` for `dev` to measure the unminified dev build. Set
`TARGETS='[{"name":"octane-tsrx","url":"http://localhost:5201/"}]'` to run a
single adapter. Set `BENCH_JSON=/tmp/effectful-list.json` for machine-readable
output (median/min/p95/sd per op per target).

## Caveats / bias notes

- The layout reads (`offsetHeight`) force synchronous reflow in all targets
  identically — 100 reads per effect-firing sample. That reflow cost is a
  constant floor shared by every column, not a framework delta.
- Solid/ripple numbers assume their sync flush (`flush()` / `flushSync`) runs
  user effects inside the timed call. If a future version defers user effects
  past the sync flush, their timed columns would exclude effect dispatch — the
  gate's settle window (50ms) would still pass, so watch for suspiciously flat
  solid/ripple `update_deps` numbers after framework upgrades.
- `update_nodeps` compares re-render models, not effect dispatch (nothing
  fires); see the methodology note above.
- The shared ops driver keeps the canonical dataset at module scope, so the
  timed ops are pure setter calls — solid's store is reconciled FROM those
  plain arrays, which is extra work octane/react/ripple don't do on the items
  ops (it's the idiomatic solid pattern for externally-produced immutable
  data, same as the dbmon bench).
