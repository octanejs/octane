# js-framework-benchmark — octane

DOM-based benchmark that mirrors the canonical
[js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)
suite, plus a **keyed-reorder matrix** extension (`run-reorder.mjs`) that
sweeps list permutations the canonical suite never touches. Drives the shared
button + table fixture against `octane` and times each operation via
Playwright.

This complements the Node-only [`tracked-values`](../tracked-values.js)
micro-suite by measuring end-to-end render performance — which is where the
auto-callback transform and stable event-bundle optimization pay off.

## Layout

```
benchmarks/js-framework/
├── octane-tsrx/    # Vite app, dev server on :5176 — octane authored in .tsrx
├── octane-jsx/     # Vite app, dev server on :5177 — same app authored in React-style .tsx
├── react/          # Vite app, dev server on :5175 — canonical keyed react-hooks
├── ripple/         # Vite app, dev server on :5178 — keyed ripple (ported to current syntax)
├── solid/          # Vite app, dev server on :5179 — Solid 2.0 (keyed <For>, production build)
├── vue-vapor/      # Vite app, dev server on :5180 — Vue 3.6 Vapor (<script setup vapor> SFC)
├── preact/         # Vite app, dev server on :5260 — native Preact hooks
├── svelte/         # Vite app, dev server on :5271 — Svelte 5 runes + keyed #each
├── run.mjs             # Playwright harness — the canonical krausest ops
├── run-reorder.mjs     # Playwright harness — the keyed-reorder matrix (see below)
├── package.json        # umbrella; depends on playwright
├── results/            # output / scratch
└── README.md           # this file
```

Both harnesses compare octane-tsrx / octane-jsx / react / preact / ripple /
solid / svelte / vue-vapor, with octane-tsrx as the ratio baseline.

The octane app is authored **twice** over the same octane core — once in `.tsrx`
(directive syntax) and once in React-style `.tsx` (JSX). Both emit the same DOM
and expose the same button + table contract:

- **`octane-tsrx`** — `@for (const row of items; key row.id)` compiles to octane's
  keyed `forBlock` fast path: a compiled per-item body, targeted per-row updates,
  host node identity preserved across re-renders.
- **`octane-jsx`** — `items.map((row) => <tr key={row.id}>…)` now lowers to the
  **same** `forBlock` fast path (the compiler recognizes a keyed JSX `.map` and
  compiles it like `@for`), so the jsx/tsrx ratio is ~1.0 — the React-JSX
  backwards-compat path carries no list-reconciliation penalty here.
- **`react`** — the canonical [keyed react-hooks][rh] implementation, the
  reference VDOM baseline. `dispatch` is wrapped in `flushSync` so React commits
  inside the discrete click (the harness times only the synchronous click; React
  18 otherwise schedules the commit afterward — see the note in its `main.jsx`).
- **`ripple`** — the [keyed ripple][rp] implementation, ported to current ripple
  syntax (`function … @{}`, `@for (…; key)`, `{expr}`). A fine-grained foil: each
  row's `label` is a `Tracked<string>`, so `update` mutates labels in place. Its
  handlers are wrapped in `flushSync` for the same sync-commit reason as react.
- **`solid`** — Solid 2.0 (keyed `<For>` over a `createSignal` row array); each
  handler calls `flush()` after the signal set for the same sync-commit reason.
- **`vue-vapor`** — the official [keyed vue-vapor][vv] implementation (Vue 3.6
  Vapor mode: a `<script setup vapor>` SFC, no VDOM), copied verbatim and
  extended with the reorder matrix. Its authoring model is fine-grained like
  ripple's: rows are a `shallowRef` array mutated in place + `triggerRef` for
  add/remove/swap, and each row's `label` is its own `shallowRef`, so `update`
  mutates labels per-cell with no array diff. Two suite-local adaptations:
  (1) Vue flushes on a microtask with **no public sync flush**, so the fixture
  exposes `window.__benchFlush = () => nextTick()` and both harnesses extend
  the timed click window until it resolves (the scheduling hop is Vue's own
  commit cost); (2) the official entry pins `vue@3.6.0-alpha.2` (when vapor
  still shipped in the main entry) — we track the current 3.6 beta, where the
  default bundler entry has no vapor runtime, so `vue` is aliased to a small
  shim over `@vue/runtime-vapor` + `@vue/runtime-dom`
  (see `vue-vapor/src/vue-shim.js`).

[rh]: https://github.com/krausest/js-framework-benchmark/tree/master/frameworks/keyed/react-hooks
[rp]: https://github.com/krausest/js-framework-benchmark/tree/master/frameworks/keyed/ripple
[vv]: https://github.com/krausest/js-framework-benchmark/tree/master/frameworks/keyed/vue-vapor

### Preact and Svelte 5 references

- **`preact`** (`:5260`) is a native Preact hooks implementation using keyed
  JSX rows and the public compat `flushSync`; it is not a React-alias build.
- **`svelte`** (`:5271`) is a runes-mode Svelte 5 implementation using a raw
  row array, keyed `#each`, modern event attributes, and public `flushSync`.

## Quick start

```bash
# 1. From the repo root, install + sync workspaces:
pnpm install

# 2. Production-build, preview, and drive all eight targets:
node benchmarks/bench.mjs --quick js-framework js-framework-reorder
node benchmarks/bench.mjs js-framework js-framework-reorder
```

To drive just one dialect, pass a `TARGETS` env (see `run.mjs`). Both harnesses
accept an iterations argv (`node run.mjs 3` for a quick smoke pass) and write a
machine-readable copy of the results when `BENCH_JSON=<path>` is set
(milliseconds; one `ops` map per target; a failed gate still writes the file
with a top-level `"failed"` field).

Output is a table of median + min millis per operation: `run`, `replace`,
`add`, `update`, `select`, `swap`, `remove`, `runlots`, `clear`. The harness
uses `page.evaluate(el.click)` to fire clicks synchronously inside the page —
avoids per-click CDP IPC overhead (~10ms each on Chromium) so the numbers
reflect the renderer's wall time, not Playwright transport. Before warmup, each
target receives the same seeded `Math.random` stream so generated label lengths
and allocation patterns cannot drift between dialects.

## Keyed-reorder matrix (`run-reorder.mjs`)

The canonical suite only ever reorders two rows (`swap`). `run-reorder.mjs`
drives the second jumbotron button row every fixture exposes — pure
permutations / splices of the current keyed 1k list, always applied through
the state setter (never in-place mutation):

| op                          | shape                                                       |
| --------------------------- | ----------------------------------------------------------- |
| `reverse`                   | `rows.toReversed()` — every survivor moves                  |
| `shuffle`                   | seeded Fisher–Yates; the seed advances deterministically per click (module-level mulberry32, fixed seed 42 — identical permutations across all eight targets) |
| `rotatef`                   | rotate forward by 1 — last row to front                     |
| `rotateb`                   | rotate backward by 1 — first row to end                     |
| `prepend100` / `append100`  | 100 fresh-id rows at head / tail                            |
| `insertmid100`              | 100 fresh-id rows at index `length/2`                       |
| `removefirst`               | drop row 0                                                  |
| `removeevery10`             | drop every 10th row                                         |
| `displace{3,4,5,6,8}`       | **displace_k**: move the FIRST k rows (as a group, order preserved) to the END — survivors stay relatively ordered, exactly k rows displaced |

**Headline framing — rotate is the LIS-vs-lastPlacedIndex differentiator.**
Octane's keyed reconciler computes a minimal move set via LIS; React's uses
`lastPlacedIndex`. On `rotatef` (last row moved to the front) the two diverge
maximally: React's first-placed child pins `lastPlacedIndex` at the old tail
index, so **every one of the 999 survivors** is physically moved, while LIS
moves exactly **1** node. The `differential/` test suite can't see this (it
compares final innerHTML, which is identical); this harness's wall time can.
Do NOT read `prepend100` as an LIS win — React handles prepended NEW items
with zero survivor moves, so both strategies are minimal there.

**displace_k and the K_DISP bracket.** `runtime.ts` (~line 8341) has a
small-displacement shortcut in `reconcileKeyed`: when every old item survives
and at most `K_DISP = 4` middle positions changed, it computes the move set
directly in O(K_DISP) instead of paying the LIS pass's O(N) allocation +
back-walk. The k ∈ {3, 4, 5, 6, 8} sweep brackets that threshold from both
sides, so a regression in either the shortcut or the LIS fallback shows up as
a step between adjacent k columns. (Note the shortcut's trigger counts
*changed positions* after prefix/suffix trimming — a group-move-to-end shifts
every position, so per the current code these ops are expected to exercise
the LIS pass with a k-node move set; the sweep documents whichever path fires
and keeps the boundary pinned.)

Two methodology points, both visible in the harness source:

- **Inner-loop timing.** The tiny ops (rotate / displace_k / remove\*) are far
  below `performance.now()` resolution for a single click, so each timed
  sample loops N clicks and divides: N=20 for displace/rotate/remove, N=4 for
  reverse/shuffle (reverse is self-inverse; shuffle reseeds per click, so
  repeated clicks are valid work), N=1 for the 100-row inserts. Caveat:
  `removeevery10` decays 1000 → ~122 rows across its 20 clicks, so its number
  is the mean over that decaying sequence — comparable across targets, not to
  a single 1000-row click. Every sample starts from a fresh 1k `#run` (reset
  outside the timed window).
- **Identity gate** (uibench-style), run once per op outside the timed loop:
  every `<tr>` is stamped with `tr.__benchId = <row id>` before the op; after
  one click the harness asserts every surviving row id is rendered by the
  SAME `<tr>` node (the framework *moved* the row, it didn't rebuild it) and
  that DOM order equals data order (the op — including the shared shuffle
  stream — is replayed on the pre-click id list). A gate failure is recorded
  per `(target, op)`: that op is skipped for that target (its DOM is wrong, so a
  timing number would be garbage) and shown as `GATE FAIL` in the table, but the
  run continues so every other target/op still produces a full matrix. If ANY
  op failed, the run prints the failures, writes `BENCH_JSON` with a top-level
  `failed` field and that target's `meta.identityGate: "fail: <op>[, …]"`, and
  exits 1. A fully-clean run reports `meta.identityGate: "pass"` for every
  target and exits 0.

  **Known ripple failures.** ripple fails the gate on `prepend100` and
  `insertmid100` — the two ops that insert a run of 100 *new* keys *before*
  surviving keys. ripple's keyed reconciler renders those interleaved
  (`[new0, old0, new1, old1, …]`) even though the data array is unambiguously
  `[100 new, then survivors]` (verified independent of how the array is built —
  concat / spread / explicit push loop all give identical correct data yet
  identical interleaved DOM). This is a genuine **ripple** keyed-reconciler bug,
  **not** octane and **not** a fixture defect; the fixtures are left faithful and
  the gate correctly flags them. `append100` is the only insert op ripple renders
  correctly, because there are no survivors *after* the inserted run. octane-tsrx,
  octane-jsx, and react pass all 14 ops.

Run it against the same eight targets as `run.mjs`:

```bash
node run-reorder.mjs           # 8 iterations
node run-reorder.mjs 16        # longer sample
# or: pnpm --filter octane-js-framework-benchmarks bench:reorder
```

A bad number here points at `reconcileKeyed` (`packages/octane/src/runtime.ts`):
the prefix/suffix walks (rotate defeats both), the small-displacement shortcut
vs LIS-pass boundary (displace sweep), survivor-splice + mount interleaving
(`insertmid100`), and the linked-list relink paths (`removeevery10` mixes
survivors and unmounts).

## Comparing against an external baseline

To compare octane against another live target (e.g. the inferno-next bench at
`inferno/benchmarks/inferno-next/` on its dev port 5175), pass a `TARGETS` env:

```bash
TARGETS='[
  {"name":"octane",  "url":"http://localhost:5176/", "ready":"#run"},
  {"name":"inferno-next","url":"http://localhost:5175/", "ready":"#run"}
]' node run.mjs
```

The harness prints a side-by-side table, then a pairwise ratio block treating the
FIRST target as the baseline:

```
inferno-next / octane ratio (median; <1 means inferno-next faster):
  run      1.07x  -- slower
  update   0.92x  ++ faster
  …
```

## What this fixture exercises

The `Main.tsrx` / `Main.tsx` source is intentionally tuned to the surface that
octane's compiler optimizes (both dialects compile to the same output):

- **Auto-callback transform**: top-level handlers (`run`, `runLots`, `add`,
  `clear`, `update`, `swap`) only close over `setItems` / `setSelected` (stable
  `useState` setters) → compiler wraps them in `useCallback([setter])`. Button
  `$$click` slots never reassign after first mount.
- **Stable event-bundle**: per-row `onClick={() => select(row.id)}` and
  `onClick={() => remove(row)}` arrows compile to `{ fn: select, args: [row.id] }`
  bundles. Re-renders with the same row identity skip the property write entirely
  — load-bearing for the `swap` row.
- **Keyed `@for` reconciliation**: `@for (const row of items; key row.id)` drives
  LIS-based reorder; `swap` only mutates the two affected rows.
- **V8 hidden-class shape**: the `Block` class shape is preserved (see
  [`feedback_inferno_next_perf`](../../packages/octane/audit/) memory).

## Methodology caveats

- Numbers depend on your CPU, browser version, and dev-vs-build mode. The harness
  loads the Vite dev server by default (not the production-built bundle), so JS
  code size and `optimize` flags are NOT what you'd ship — useful for iteration,
  not for absolute scoring.
- For "publishable" numbers, build first
  (`pnpm --filter octane-tsrx-jsbench build`, likewise `octane-jsx-jsbench`),
  then `pnpm --filter octane-tsrx-jsbench preview` to serve the production output,
  then run the harness against that.
- Chromium is the default browser; results on Firefox / WebKit differ.
