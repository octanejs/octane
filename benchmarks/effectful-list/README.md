# effectful-list bench — octane (TSRX vs JSX) vs react vs solid vs ripple vs vue-vapor

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
├── vue-vapor/     # Vite app, dev :5221 — Vue 3.6 Vapor: keyed v-for + onMounted/
│                  #   onUnmounted/watchPostEffect; ops return nextTick() (no sync flush)
├── preact/       # Vite app, dev :5266 — native Preact hooks/effects/refs
├── svelte/       # Vite app, dev :5277 — Svelte 5 effects + attachments
├── run.mjs        # Playwright harness — gates + timings
├── package.json   # umbrella: `pnpm bench`
└── README.md
```

All eight apps share the same `data.js` (seeded mulberry32 item factory) and
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

The earlier batch-clear cleanup defect no longer reproduces on the frozen
`8a45222ab` baseline or the current effects/scheduling candidate. The production
Octane fixture passes all six lifecycle gates, including 1,000 effect cleanups
and 1,000 ref cleanups for `clear` and `remount`. The fixtures retain those gates
as regression protection; see [the current measurements](../effect-scheduling/README.md).

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
  frameworks (solid, ripple, vue-vapor) don't re-render row bodies on an
  unrelated parent signal, so their column is ~the cost of one text-node
  update. It's kept for all eight targets because the gate (zero effect fires)
  is still a correctness statement about each framework.
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
  - **vue-vapor** has no public synchronous flush — every op returns
    `nextTick()` (settles after `flushJobs`: DOM mutated AND the post-flush
    `watchPostEffect`s drained) and the harness awaits the thenable inside the
    timed window, between inner-loop iterations. `onMounted`/`onUnmounted` are
    the mount/cleanup pair; `watchPostEffect` tracking the reactive `item`
    prop is the layout-effect slot (post-DOM, pre-paint). Vue function refs
    have no cleanup-return protocol AND vapor re-invokes a dynamic `:ref` with
    the SAME element when a keyed row's item updates, so the shared `rowRef`
    counts transitions only: first-attach per element → `refs`, the
    null-on-unmount call → `refCleanups` (verified by the `update_deps` and
    `remove_100_scattered` gates).

The suite also includes **Preact** on `:5266` and **Svelte 5** on `:5277`.
Preact waits for its native passive-effect phase through a post-commit sentinel;
Svelte maps row refs to `{@attach}` cleanup and keys effects to the same
primitive dependencies. The existing exact counter gate is authoritative.

## Running

The unified runner production-builds and previews all eight targets before
running the harness:

```bash
node benchmarks/bench.mjs --quick effectful-list
node benchmarks/bench.mjs effectful-list
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

## Effect dispatch work and callback contract

```bash
node benchmarks/effectful-list/dispatch.mjs
node benchmarks/effectful-list/dispatch.mjs <baseline-git-ref>
BENCH_JSON=/tmp/effect-dispatch.json node benchmarks/effectful-list/dispatch.mjs <baseline-git-ref>
```

This untimed companion extracts the actual `runEffectBody` and
`fireEffectCleanup` declarations by TypeScript AST and compiles their production
branches. It dispatches 1,000 effects
in each of the three effect phases, with omitted arguments, an explicit empty
array, and three explicit values. Separate clean and observed executions must
agree on callback arguments and receiver, cleanup delivery, and exception
handling. Stale revisions, disconnected bodies, and superseded publications
are skipped. Additional controls remove or replace the current hook entry while
retaining the declaration list, and revoke membership inside a cleanup before
its body runs. The default guard requires zero argument-array creation events
and at most one hook Map read per cleanup/body attempt;
`--measure` records historical implementations without enforcing that ceiling.

The observer runs after production transformation and counts source array-literal
creation events inside these helpers. A fixture-owned Map observer counts their
hook lookups. Their collaborators are boundary stubs; the
fixture and observer allocations are excluded. The existing browser workload
and runtime tests cover lifecycle integration. These numbers do not measure
heap allocation, garbage collection, or end-user latency: an optimizing engine
may already remove a short-lived empty array. The JSON records Node/V8 versions
and runtime/helper hashes; a paired run uses the same fixture and toolchain.
The explicit-array cases are negative controls and must remain at zero.

### Remaining dispatch proposals from #981

The `8a45222ab` baseline and this change both perform **21,000 hook Map reads and
zero argument-array creations** in each 3,000-effect case. Each iteration has
three current cleanup/body attempts, two stale-revision attempts, two superseded
publication attempts, and a disconnected body that returns before lookup.
These are deterministic work counts, not timing or heap-allocation measurements.
The earlier removal of the no-deps `[]` fallback remains protected; this audit
makes no additional dispatch throughput claim.

Two alternatives were rejected:

- **Indexing the effect declaration list or retaining an unchecked slot pointer:**
  the hooks Map remains the authority for membership. The body pass must resolve
  it again after user cleanup can reenter rendering. An old slot's matching
  revision does not prove current membership after a removal or replacement.
  The membership controls reject the indexed-list variant; no per-record pointer,
  generation, or extra invalidation scheme was added to force this optimization.
- **Calling zero-to-four-argument callbacks directly:** a callback can expose its
  own `apply` property, including a getter that throws. Reading dependency values
  before that property also changes observable ordering. The new public-root
  callback tests preserve the null receiver, positional values, sparse arrays,
  getter ordering, returned cleanup, and error reporting in every effect phase.
  A specialization would need additional guards and a benefit sufficient to pay
  for them. The existing `apply(null, args)` path is retained.

Reproduce the dispatch comparison with:

```bash
BENCH_JSON=/tmp/effect-dispatch-981.json node benchmarks/effectful-list/dispatch.mjs 8a45222ab
./node_modules/.bin/vitest run packages/octane/tests/effect-callback-contract.test.ts
```

The full effectful-list browser gates remain the integration check for actual
mount, unchanged-dependency update, changed-dependency update, and teardown.

Validation on Node 26.4.0 / V8 14.6: all 54 callback-contract cases passed in
development and production. Replacing the call with `Reflect.apply` made all
12 own-`apply` cases fail; the original call was restored and all 54 passed
again. A scratch extraction using `effectSlots[entry.order]` with both key and
revision guards failed the membership control. The final guard passed for both
the baseline and candidate; their extracted dispatch-helper hashes are equal.
