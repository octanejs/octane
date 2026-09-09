# recursive-context bench — context fan-out across frameworks

A second benchmark adjacent to [`js-framework`](../js-framework/). Where
js-framework-benchmark measures wide flat-list rendering (1000 rows in a table),
this one measures **deep recursive component trees** with Context reads at every
leaf — the workload that stresses createBlock/renderBlock overhead per node,
hook-slot allocation per scope, and Context lookup through the active-component
parent chain.

## Layout

```
benchmarks/recursive-context/
├── octane-tsrx/       # Vite app, dev :5185 — octane authored in .tsrx
├── octane-jsx/        # Vite app, dev :5188 — same app authored in React-style .tsx
├── solid/             # Vite app, dev :5187 (Solid 2.0 beta)
├── react/             # Vite app, dev :5186 (React 19)
├── ripple/            # Vite app, dev :5184
├── vue-vapor/         # Vite app, dev :5189 — Vue 3.6 Vapor: provide/inject shallowRefs;
│                      #   update ops return nextTick() (no public sync flush)
├── preact/           # Vite app, dev :5264 — native Preact context + hooks
├── svelte/           # Vite app, dev :5275 — Svelte 5 createContext + runes
├── run.mjs            # Playwright harness — drives all adapters
├── work.mjs           # untimed Chromium precise-call-coverage gates for Octane
├── context-cache-work.mjs # Map-construction gate and observational update timings
├── package.json       # umbrella: `pnpm bench`
└── README.md
```

The octane app is authored twice over the same octane core — `.tsrx` (directive
syntax: `@if/@else`, `class`) and React-style `.tsx` (JS control flow, `className`).
Both compile to working blocks over the same runtime, so the two octane columns
are a like-for-like read on the JSX backwards-compat path's cost for this
recursive-tree + Context workload.

Context maps to each framework's native mechanism: Octane, React, and Preact use
`createContext` + `useContext`; Solid uses signal getters as context values;
Svelte uses `createContext` with reactive objects; and Vue uses
`provide`/`inject` with shallow refs. Vue has no public synchronous flush, so
its update ops return `nextTick()` and the harness awaits that thenable inside
the timed window.

## Shape

Balanced binary tree, depth `D=10` → **1024 leaves**, **2047 total components**.
Each leaf reads two Context values (root + local) and renders one `<span>` with
the leaf's path + both values.

- Deep nesting (1000 levels) is degenerate (a single linear chain).
- Pure wide fanout (1000 siblings) is what `@for` already exercises in
  js-framework.
- A balanced tree exercises both axes: component-call overhead AND DOM
  reconciliation.

## Six measurements

The bench separates three orthogonal axes: **fan-out scope** (global vs subtree
updates), **structural change** (toggle a subtree on/off vs mutate a value), and
**teardown scale** (full container vs partial branch).

- **MOUNT** — empty DOM → fully painted tree. Exercises createBlock × N,
  renderBlock × N, hook-slot allocation × N, Context subscription × N.
- **UPDATE_ROOT** — mutates the root context value; **every leaf re-reads** (1024
  leaves). Exercises renderBlock × N, hook-slot lookup × N, Context lookup × N.
- **UPDATE_PARTIAL** — mutates state on a single mid-node at depth `M=5`; only its
  **2^(D−M) = 32 leaves** re-read. If the framework scopes descendant updates
  correctly, this should be ≈32× faster than UPDATE_ROOT. A ratio closer to 1×
  means the framework is wastefully re-running unaffected branches.
- **PARTIAL_UNMOUNT** — toggles a `visible` flag on the Mid component so the
  conditional render drops its subtree; **32 leaves** unmount, the rest of the
  tree stays put. Mid itself remains mounted so its state handle stays valid for
  re-show. Exercises per-block teardown without the full-container shortcut that
  UNMOUNT can take.
- **PARTIAL_REMOUNT** — flips the same flag back on; the **32-leaf subtree is
  constructed fresh** and re-subscribes to both contexts. Exercises a scoped mount
  path that exercises the same code as MOUNT but at 1/32 the work — useful for
  separating per-component overhead from total tree cost.
- **UNMOUNT** — full teardown via the framework's unmount API. Some frameworks
  (octane with the `container.textContent = ''` shortcut, Solid with
  owner-tree dispose) can short-circuit this; the contrast against PARTIAL_UNMOUNT
  shows whether the win is structural or only applies to the whole-container case.

Native **Preact** (`:5264`) uses core context and hooks. **Svelte 5** (`:5275`)
uses `createContext` with reactive context-scoped values so the 32-leaf local
provider remains isolated from the rest of the 2,047-component tree.

## Quick start

```bash
# 1. From the repo root, install:
pnpm install

# 2. Production-build, preview, and drive all eight targets:
node benchmarks/bench.mjs --quick recursive-context
node benchmarks/bench.mjs recursive-context
```

The unified runner also executes `work.mjs` against the already-built Octane
previews. Run it directly with `pnpm --dir benchmarks/recursive-context
bench:work` when those two previews are already running.
Run `pnpm --dir benchmarks/recursive-context bench:cache` for the focused
context-cache gate. It builds the Octane production fixture and starts its own
preview on an ephemeral local port; no other preview servers are needed.

Output is a side-by-side table of median / min / p95 millis per op, followed by a
pairwise ratio block, e.g.:

```
octane-tsrx / vue-vapor ratio (score; <1 means octane-tsrx faster):
  mount             0.71x  ++ faster
  update_root       0.59x  ++ faster
  update_partial    0.84x  ++ faster
  partial_unmount   0.74x  ++ faster
  partial_remount   0.48x  ++ faster
  unmount           0.25x  ++ faster
```

## Measurement contract

Each adapter installs these globals on `window`:

| global               | what it does                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `__mount()`          | calls the framework's mount API (deferred — index.html does NOT auto-mount, so MOUNT timing is meaningful) |
| `__updateRoot()`     | mutates the root context value; all leaves re-render                                                       |
| `__updatePartial()`  | mutates state on the mid-node at depth `M=5`; only its 32-leaf subtree re-renders                          |
| `__partialUnmount()` | flips Mid's `visible` flag to false; the 32-leaf subtree unmounts. Mid itself stays mounted                |
| `__partialRemount()` | flips Mid's `visible` flag back to true; the 32-leaf subtree is freshly constructed                        |
| `__unmount()`        | tears down via the framework's unmount API; does NOT pre-clear `target.children`                           |
| `__reset()`          | `__unmount()` + clear `target.children` — for between-iteration cleanup                                    |
| `__ready = true`     | last line of `main.js`; the harness gates on `page.waitForFunction("__ready")`                             |

The harness:

- **MOUNT**: fresh `page.goto` per sample so module-eval cost is amortized across
  iterations rather than across samples.
- **UPDATE_ROOT / UPDATE_PARTIAL**: one page, `__mount()` once, then loop
  `__updateRoot()` / `__updatePartial()` × (warmup + iter). The two are sampled in
  alternating rounds so any GC/JIT noise hits them symmetrically.
- **PARTIAL_UNMOUNT / PARTIAL_REMOUNT**: one page, `__mount()` once, then per
  iteration time `__partialUnmount()` followed by `__partialRemount()` and record
  BOTH halves. Alternating in lockstep means GC/JIT noise hits both ops
  symmetrically — important because they're mirrored work (tear down 32 leaves vs
  build 32 leaves).
- **UNMOUNT**: one page; per iteration `__mount()` (untimed), time `__unmount()`,
  then `__reset()` + small sleep before the next iteration.

After the semantic gate, the harness publishes zero-variance DOM censuses for
the mounted tree and the partial-unmount state. Visible element/text counts are
semantic controls; total/comment counts expose framework bookkeeping. The
Octane dialect timing rows also have order-balanced aliases: the primary
TSRX→TSX pass is repeated TSX→TSRX, and the two fully-warmed sample sets are
combined for TSX/TSRX ratio guards.

`work.mjs` observes emitted production bundles rather than adding source probes
that could change compiler purity. The unified runner first times the normal
minified builds; then the untimed work pass rebuilds the two Octane fixtures with
`vite build --minify false` so Chromium can attribute precise calls to named
functions. Run `bench:work` with both Octane preview servers running; it also
performs the diagnostic rebuild. A jitless Chromium precise-coverage pass caps
blocks, generic slots, descriptors, keyed survivor work, and teardown scopes at
their current levels while permitting reductions. Full/all-slot aggregates
allow a generic slot to become a cheaper specialized slot without allowing
duplicate dispatch. Every row requires live production-bundle coverage, and
root and partial updates must still execute exactly 1024 and 32 `setText` calls.

The TSRX leaf reads two local `createContext` values and no promises. Before
removing its redundant context-only `useBatch`, the 1024-leaf mount and root
update each called `useBatch` 3072 times; the 32-leaf partial update and
remount each called it 94 times. Exact gates now require 2048 and 62 calls,
respectively: the remaining calls register the independent child warm plans
with `useBatch([], warmThunk)`. The JSX twin emits no `useBatch` calls for this
fixture. The normal DOM checks in `run.mjs` still verify all 1024 leaf paths,
both context values, the isolated 32-leaf provider update, and remount identity.

The same work pass also compiles a plain TypeScript custom hook with two reads
from a directly initialized module context in both client and server modes. Its
codegen-size gate permits no growth beyond the authored source, preserves both
`use()` calls, and requires zero generated `useBatch`/`puBatch` imports or calls.
A separate mixed context/promise hook must still generate one batch call in each
mode, confirming that the analyzer detects the helper when batching is needed.

The context-cache work pass builds a second production HTML entry in the TSRX
fixture. It renders 512 keyed consumer components with zero, one, or two
**distinct** context reads and identical visible DOM. An initialization script
wraps the browser's native `Map` constructor; the harness resets its counter
around mount, root-context update, second-context update, keyed reorder, and
unmount. An explicit `new Map()` verifies the probe. It checks every row's
text and identity after updates and reversal, including the second provider's
new value in the two-context case, and checks teardown. The zero-context
fixture controls for shared root, provider, and keyed-row allocations.

Before the inline single-context cache, mount constructed 6 Maps for the
zero-context control and 518 Maps each for one- and two-context consumers: 512
extra Maps in each reader mode. The exact production gates now require zero
extra Maps for the one-context mode and 512 for the two-context spill. All
three modes must incur no extra Map construction over the zero-context control
on subsequent updates, reorder, and teardown. The gate runs from `work.mjs`
after its precise-coverage pass, and can also run independently via
`bench:cache`. A fresh, uninstrumented browser realm records 40 batches of
20 root updates per mode with 12 warmup updates; update times are diagnostics,
not wall-time pass/fail gates.

Default: 10 warmups + 20 iters. Pass an integer to `bench` to override iters
(`bench:long` runs 40).
