# memo-wall bench — memo and fine-grained walls across frameworks

A benchmark adjacent to [`js-framework`](../js-framework/), [`dbmon`](../dbmon/)
and [`recursive-context`](../recursive-context/). Where those measure list
create/update throughput, **memo-wall isolates the memo bail**: 1000
`memo(Row)` children under one parent, where a parent re-render traditionally
gets absorbed by 1000 shallow-equal prop comparisons, a single prop change must
re-render exactly one row, and a context bump above the wall must refresh only
the leaf consumers without re-running any bailed body. Octane TSRX wall A also
exercises the default production `autoMemo` transform: an equal `items`
dependency reuses the whole `RowsA` region before the keyed wall. Wall B stays
the untransformed control — autoMemo does not reach through an imported
helper's returned descriptors (that calculation/output phase ships together
with per-key descriptor reuse), so every wall-B parent update rebuilds all
1000 descriptors and must be absorbed by the value-comparing memo bail.

This is the canonical home for octane's `shallowEqualProps` and
`refreshContextConsumers` numbers — if a store-fanout suite lands later it must
NOT duplicate them. A bad number here points at `tryMemoBail` (both arms),
`shallowEqualProps`'s key walk, `useContextInternal`'s memo-ancestor stamping,
or the `refreshContextConsumers` / `refreshBlockForContext` descent.

**Fine-grained columns (Solid / Ripple / Svelte / Vue Vapor).** Parent
re-renders don't exist in fine-grained frameworks, so there is no memo wall to absorb one — their
`parent_rerender_equal_*` numbers are near-zero BY MODEL (a tick bump updates
one header text node), which is exactly what these columns are here to show.
Their probes count the fine-grained equivalents: component CREATIONS for
Row/Inner, leaf TEXT-EFFECT re-runs for Leaf (the analog of a Leaf re-render),
with the keyed lists keyed by row-object identity so `one_change_*` recreates
exactly one row. The same exact-count gates hold with the same expectations.
Ripple's version puts the leaf probe in a reactive text expression, keys its
`@for` by row-object identity, and carries a stable accessor in theme context.

## Layout

```
benchmarks/memo-wall/
├── octane-tsrx/   # Vite app, dev :5206 — octane authored in .tsrx
├── octane-jsx/    # Vite app, dev :5207 — same app authored in React-style .tsx
├── react/         # Vite app, dev :5208 (React 19, production mode)
├── react-compiler/ # :5226; same React source + official React Compiler 1.0.0
├── solid/         # Vite app, dev :5182 (Solid 2.0 — no wall; fine-grained probes)
├── ripple/        # Vite app, dev :5225 (fine-grained creation/text probes)
├── vue-vapor/     # Vite app, dev :5223 (Vue 3.6 Vapor — no wall; fine-grained probes)
├── preact/       # Vite app, dev :5267 (memo + core context)
├── svelte/       # Vite app, dev :5278 (fine-grained creation/text probes)
├── run.mjs        # Playwright harness — drives all targets, enforces the gates
├── work.mjs       # untimed Chromium precise-call-coverage work gates
├── package.json   # umbrella: `pnpm bench`
└── README.md
```

## Shape

Every row is the same 2-deep memo chain:

```
memo(Row)  → 3 host elements + memo(Inner) → host element + Leaf
Leaf       → reads the wall's theme context (NOT memo'd — the refresh endpoint)
```

Row takes 5 props — `id` / `label` / `value` (primitives off a module-level,
seeded-PRNG item array), `wall` (a literal), `onSelect` (a module-level
handler) — ALL reference-stable across parent re-renders except when an op
deliberately changes them.

Two walls of 1000 rows sit side by side on the same page, differing only in
how `<Row>` is put on screen:

- **wall A — compiled list position**: `@for (…; key it.id) { <Row …/> }`
  (`.tsrx`) / keyed `.map` (`.tsx`) inside a `RowsA` component →
  `forBlock` → `componentSlot` → the **componentSlot arm** of `tryMemoBail`.
  Production autoMemo witnesses the imported Row's default memo contract and
  promotes unchanged survivors through the existing PURE item path, so a
  one-item change enters only one item helper. The list lives in `RowsA`
  (host-element root) rather than inline in the
  Provider children because the `.tsx` dialect only folds a keyed `.map` to
  the compiled forBlock under host-only ancestors; the Octane, React, and
  Preact fixtures keep the identical structure so those columns stay comparable.
  The default production `autoMemo` transform also caches the call to pure
  `RowsA` by its inferred `items` capture and skips this whole path on
  equal/context-only parent updates. The return-JSX `.tsx` descriptor-cache path
  is a later phase and currently remains a 1000-bail control.
- **wall B — value-position**: a plain-`.ts` helper (`src/wall-b.ts`) builds
  `createElement(Row, props)` descriptors that reach the DOM through a
  `{rows}` children hole → `childSlot`'s keyed de-opt list → the **childSlot
  arm** of `tryMemoBail`. This is the shape every `@octanejs/*` binding
  produces. A fresh descriptor + fresh props object is allocated every parent
  render — the bail must succeed on prop VALUES, not object identity. autoMemo
  deliberately leaves this path alone: caching an imported helper's returned
  descriptors is the calculation/output phase, deferred until per-key
  descriptor reuse makes its miss path at least as fast as the bail it
  replaces.

For React the A/B distinction collapses (JSX IS `createElement`); both walls
are kept so the op list and DOM stay identical across targets. The vanilla
column uses ordinary `@vitejs/plugin-react`. The `react-compiler` column shares
that exact source and adds Vite's official `reactCompilerPreset()` backed by
`babel-plugin-react-compiler@1.0.0`, so the comparison differs only by the
production compiler. React Compiler caches the `.map`, imported helper call,
and their JSX regions by the inferred `items` dependency.

Each wall owns its own item array, an unrelated `tick` state, and a theme
context provider ABOVE the rows. There is one context object PER WALL: an
octane context's `$$version` is global to the context object, so a shared
context would let wall A's provider bumps stale-stamp wall B's memo boundaries
and contaminate wall B's next op with a spurious 1000-leaf refresh.

## Render-count probes (the correctness gate)

Every Row/Inner/Leaf body increments a `window.__renders` counter as its first
statement (plain counter mutation — no setState, so the timed window stays
pure). After each op's timed loop the harness runs ONE verification invocation
with fresh counters and asserts the EXACT expected counts, plus a DOM check
(leaf text = current theme; the changed row shows its bumped value).
**`parent_rerender_equal_*` must show 0 row-body invocations — over the whole
timed loop too — or the harness exits 1**, because a single reference-unstable
prop silently turns the entire suite into a full-re-render measurement.

Those body counters intentionally do not sit inside `RowsA` or its item helper:
an observable mutation there would make the candidate impure and correctly
disable automatic memoization. `work.mjs` provides the stronger, untimed gate
after compilation using Chromium precise call coverage. For TSRX equal/context
A it requires zero list helpers, keyed survivor visits, descriptors, shallow
memo comparisons, and row bodies (context A additionally requires exactly 1000
Leaf refreshes). Wall B's gates pin the memo-bail control: every parent update
runs the helper once, builds 1000 descriptors, visits 1000 survivors, and bails
1000 comparisons with zero row bodies. Mount and one-change A/B also carry
exact compiled-work gates.

The React Row/Inner/Leaf counters likewise make those component bodies impure,
so React Compiler conservatively leaves them alone; the explicit `memo`
boundaries still provide the row semantics. The proving-ground optimization is
in the pure RowsA/Wall calculations and JSX regions, which remain compiler
eligible and are visible in the generated `react/compiler-runtime` cache code.

## Ops

| op                        | what happens                              | gate (per invocation)            |
| ------------------------- | ----------------------------------------- | -------------------------------- |
| `mount`                   | fresh page renders both walls (2000 rows) | 1000× row/inner/leaf per wall    |
| `parent_rerender_equal_A` | bump wall A's unrelated `tick`            | **0 bodies anywhere**            |
| `parent_rerender_equal_B` | same, wall B (childSlot arm)              | **0 bodies anywhere**            |
| `one_change_A`            | one item object replaced (value+1)        | exactly 1 row + 1 inner + 1 leaf |
| `one_change_B`            | same, wall B                              | exactly 1 row + 1 inner + 1 leaf |
| `ctx_through_wall_A`      | bump wall A's provider value              | 0 row, 0 inner, **1000 leaf**    |
| `ctx_through_wall_B`      | same, wall B                              | 0 row, 0 inner, **1000 leaf**    |

All ops commit synchronously (`flushSync` inside the `window.__op` hooks); the
harness first calibrates each target/operation to an 8ms batch, then forces
`gc()` before every sample and divides the batch by its repetition count. This
keeps auto-memoized and fine-grained regions above the browser timer's
resolution without making slower memo-wall targets run oversized batches.
Default 20 iterations (+5 warmup); `node run.mjs 50` for longer. The chosen
repetition counts are recorded in each target's result metadata.

Native **Preact** (`:5267`) uses `memo` and core context. **Svelte 5** (`:5278`)
reports compiler-granular behavior: component-creation probes run once, context
consumers update selectively, and object keys recreate exactly one changed row.
The production **React Compiler** comparison runs at `:5226`.

## Running

The unified runner builds and starts every production preview server before it
runs the harness:

```bash
node benchmarks/bench.mjs --quick memo-wall
node benchmarks/bench.mjs memo-wall
```

Swap `build && … preview` for `dev` to measure the unminified dev build. Set
`TARGETS='[{"name":"octane-tsrx","url":"http://localhost:5206/"}]'` to run a
single target (the first target is the ratio baseline). Set
`BENCH_JSON=/path/out.json` to also write machine-readable results (on a gate
failure the file still gets written, with a top-level `failed` field, and the
process exits 1).

Run the deterministic work gate against a separate unminified production build
(stable function names are needed for precise coverage; this build is never
used for timings):

```bash
MEMO_WALL_WORK=1 pnpm --filter octane-tsrx-memowall-bench build
pnpm --filter octane-tsrx-memowall-bench preview
pnpm --dir benchmarks/memo-wall bench:work
```

Set `TARGET_URL` to use a non-default preview URL and `WORK_JSON` to persist the
per-operation counts.

## Caveats / bias notes

- `one_change_*` still traverses the 1000 keyed survivors. Wall A's inferred
  PURE path enters only the changed item helper; wall B also performs the 999
  successful prop bails around the single miss. This is the intended "one
  change amid a wall" workload, not a pure single-row-render cost.
- Vanilla React and Octane JSX `parent_rerender_equal` include recreating or
  reconciling 1000 row descriptions. Auto-memoized Octane TSRX stops at wall
  A's inferred region/list dependencies but deliberately rebuilds wall B's
  descriptors (imported-helper output caching is a later phase), while React
  Compiler caches both the `.map` and the imported helper call. The
  cross-framework ratio is the honest end-to-end cost of each production
  compiler, not an instruction-level apples-to-apples comparison.
- `mount` covers BOTH walls (2000 rows + providers), not 1000.
- `ctx_through_wall_*` asserts `inner === 0`: octane's
  `refreshContextConsumers` and React's lazy context propagation both skip
  memo'd pure indirections. A failure there is a real propagation regression,
  not fixture noise.
