# memo-wall bench — octane (TSRX vs JSX) vs react

A benchmark adjacent to [`js-framework`](../js-framework/), [`dbmon`](../dbmon/)
and [`recursive-context`](../recursive-context/). Where those measure list
create/update throughput, **memo-wall isolates the memo bail**: 1000
`memo(Row)` children under one parent, where a parent re-render must be
absorbed by 1000 shallow-equal prop comparisons, a single prop change must
re-render exactly one row, and a context bump above the wall must refresh only
the leaf consumers without re-running any bailed body.

This is the canonical home for octane's `shallowEqualProps` and
`refreshContextConsumers` numbers — if a store-fanout suite lands later it must
NOT duplicate them. A bad number here points at `tryMemoBail` (both arms),
`shallowEqualProps`'s key walk, `useContextInternal`'s memo-ancestor stamping,
or the `refreshContextConsumers` / `refreshBlockForContext` descent.

Solid and ripple are omitted deliberately: parent re-renders don't exist in
fine-grained frameworks, so a "wall of memo boundaries absorbing a parent
re-render" has no equivalent to measure.

## Layout

```
benchmarks/memo-wall/
├── octane-tsrx/   # Vite app, dev :5206 — octane authored in .tsrx
├── octane-jsx/    # Vite app, dev :5207 — same app authored in React-style .tsx
├── react/         # Vite app, dev :5208 (React 19, production mode)
├── run.mjs        # Playwright harness — drives all targets, enforces the gates
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
  The list lives in `RowsA` (host-element root) rather than inline in the
  Provider children because the `.tsx` dialect only folds a keyed `.map` to
  the compiled forBlock under host-only ancestors; all three fixtures keep
  the identical structure so the columns stay comparable.
- **wall B — value-position**: a plain-`.ts` helper (`src/wall-b.ts`) builds
  `createElement(Row, props)` descriptors that reach the DOM through a
  `{rows}` children hole → `childSlot`'s keyed de-opt list → the **childSlot
  arm** of `tryMemoBail`. This is the shape every `@octanejs/*` binding
  produces. Fresh descriptor + fresh props object every render — the bail must
  succeed on prop VALUES, not object identity.

For React the A/B distinction collapses (JSX IS `createElement`); both walls
are kept so the op list and DOM stay identical across targets — expect the two
React columns to read ~equal.

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
harness forces `gc()` before every sample and loops sub-millisecond ops
(10× re-render/one-change, 5× ctx) inside the timed window, dividing by the
rep count. Default 20 iterations (+5 warmup); `node run.mjs 50` for longer.

## Running

Start the three preview servers (production builds), then run the harness:

```bash
# build + preview each (production); run from the repo root
pnpm --filter octane-tsrx-memowall-bench build && pnpm --filter octane-tsrx-memowall-bench preview &
pnpm --filter octane-jsx-memowall-bench  build && pnpm --filter octane-jsx-memowall-bench  preview &
pnpm --filter react-memowall-bench       build && pnpm --filter react-memowall-bench       preview &

# then, from benchmarks/memo-wall:
pnpm bench           # 20 timed iterations (+5 warmup) per op
pnpm bench:long      # 50 iterations
```

Swap `build && … preview` for `dev` to measure the unminified dev build. Set
`TARGETS='[{"name":"octane-tsrx","url":"http://localhost:5206/"}]'` to run a
single target (the first target is the ratio baseline). Set
`BENCH_JSON=/path/out.json` to also write machine-readable results (on a gate
failure the file still gets written, with a top-level `failed` field, and the
process exits 1).

## Caveats / bias notes

- `one_change_*` numbers include the 999 successful bails around the single
  miss — that's the intended "one change amid a wall" workload, not a pure
  single-row-render cost.
- React's `parent_rerender_equal` inherently includes re-creating 1000 element
  descriptors per render (that IS React's model); octane wall A re-runs the
  compiled `@for` body per survivor instead. The cross-framework ratio is the
  honest end-to-end cost of the same authored behavior, not an
  instruction-level apples-to-apples.
- `mount` covers BOTH walls (2000 rows + providers), not 1000.
- `ctx_through_wall_*` asserts `inner === 0`: octane's
  `refreshContextConsumers` and React's lazy context propagation both skip
  memo'd pure indirections. A failure there is a real propagation regression,
  not fixture noise.
