# recursive-context bench — octane vs ripple vs react vs solid

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
├── run.mjs            # Playwright harness — drives all adapters
├── package.json       # umbrella: `pnpm bench`
└── README.md
```

The octane app is authored twice over the same octane core — `.tsrx` (directive
syntax: `@if/@else`, `class`) and React-style `.tsx` (JS control flow, `className`).
Both compile to working blocks over the same runtime, so the two octane columns
are a like-for-like read on the JSX backwards-compat path's cost for this
recursive-tree + Context workload.

Context maps to each framework's native mechanism: octane/React `createContext`
+ `useContext`, Solid `createContext` + `useContext` (signal getters as the
context value), Vue `provide`/`inject` (shallowRefs as the provided values —
leaves read them in their text expression, so updates re-fire only leaf text
renderEffects; non-Mid leaves get the non-reactive inject default `0` and never
subscribe). Vue has no public synchronous flush, so the vue-vapor update ops
return `nextTick()` and the harness awaits the thenable inside the timed
window.

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

## Quick start

```bash
# 1. From the repo root, install:
pnpm install

# 2. Start each adapter's dev server (separate terminals):
pnpm --filter octane-tsrx-recursive-bench dev   # :5185
pnpm --filter octane-jsx-recursive-bench dev    # :5188
pnpm --filter solid-recursive-bench dev         # :5187
pnpm --filter react-recursive-bench dev         # :5186
pnpm --filter ripple-recursive-bench dev        # :5184
pnpm --filter vue-vapor-recursive-bench dev     # :5189

# 3. Run the harness:
pnpm --filter @benchmarks/recursive-context bench
# or for a longer sample:
pnpm --filter @benchmarks/recursive-context bench:long
```

Output is a side-by-side table of median / min / p95 millis per op, followed by a
pairwise ratio block, e.g.:

```
octane-tsrx / ripple ratio (median; <1 means octane-tsrx faster):
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

Default: 5 warmups + 20 iters. Pass an integer to `bench` to override iters
(`bench:long` runs 40).
