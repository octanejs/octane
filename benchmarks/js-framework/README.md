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
- Both Octane fixtures expose `window.__benchFlush` through public `flushSync`.
  The harness calls it inside each timed click so a scheduled Octane commit is
  included in the duration.
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
  JSX rows. The harness awaits Preact's queued microtask commit inside each timed
  click; it is not a React-alias build.
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

For the older **1,000-row clear** comparison, use `CLEAR_1K=1` with `run.mjs`.
It defaults to 5 warmups and 15 measured samples. Set `CPU_THROTTLE=4` to apply
Chromium's 4× CPU throttle to every target:

```bash
CLEAR_1K=1 CPU_THROTTLE=4 TARGETS='[{"name":"octane-tsrx","url":"http://localhost:5176/","ready":"#run"}]' node benchmarks/js-framework/run.mjs
```

This diagnostic reports `clear_1k` under the separate `js-framework-clear-1k`
suite name. The canonical `clear` operation still starts from 10,000 rows.

This local in-page click timer excludes paint and browser automation latency;
its numbers should not be compared directly with the official benchmark's
Chrome timeline measurements.

Output is a table of median + min millis per operation: `run`, `replace`,
`add`, `update`, `select`, `swap`, `remove`, `runlots`, `select_lots`, `clear`.
The harness uses `page.evaluate(el.click)` to fire clicks synchronously inside
the page — avoids per-click CDP IPC overhead (~10ms each on Chromium) so the
numbers reflect the renderer's wall time, not Playwright transport. Each timed
click also verifies its DOM change immediately after its timer ends, before
another scheduler turn can commit. Before warmup, each target receives the same
seeded `Math.random` stream so generated label lengths and allocation patterns
cannot drift between dialects.

Selection samples alternate between the fifth and sixth rows so every click
changes the selected key instead of measuring an equal-value state bailout.
`select_lots` reuses the 10,000 rows from `runlots` and alternates between rows
5,000 and 5,001, moving list-wide selection work above the browser's timer
resolution. Its same-run TSRX/JSX ratio protects compiler-proven keyed selection
without depending on machine-specific absolute timings. After each timed
selection, an untimed correctness gate verifies that exactly the clicked row
carries the selected class.

After all timed samples, both Octane dialects also mount 1,000 and 10,000 rows,
append 1,000 or 100 rows, and prepend or insert 100 rows into the middle under
deterministic browser DOM instrumentation. Each row must retain its ordinary
direct insertion into the connected table body: detached fragments reduced DOM
API calls but measurably slowed Chromium's real mount time. The gate checks row
count, insertion position and order, survivor DOM identity, connectivity,
delegated events, and selection, then uses precise production call coverage in
a separate `--jitless` browser to guard reduced per-row framework work without
depending on minified helper names or contaminating wall-clock measurements.

### Implicit de-opt list key work gate

The opt-in `unkeyed` mode of `style-work.mjs` checks the production de-opt list
path with 1,000 unkeyed host descriptors and an explicit key `"0"`. The rows
cross a compiled `.tsrx` child hole, so the scoped key helper runs once per row. An
unrelated update supplies fresh descriptors; the gate checks row order and DOM
identity, typed uncontrolled input values, focus, and separation between the
implicit index zero and explicit key `"0"`. Chromium precise coverage counts
the production helper calls. The readable production asset also identifies
whether top-level implicit keys concatenate a string for each of the 1,000
rows or use the numeric index. This is a deterministic source-work check, not
a wall-time or measured heap-allocation comparison.

```bash
# From the repo root, build the separate fixture under the ignored
# octane-tsrx/dist/unkeyed-work directory:
pnpm --filter octane-tsrx-jsbench exec vite build --config vite.config.unkeyed.js
pnpm --filter octane-tsrx-jsbench exec vite preview --config vite.config.unkeyed.js --host 127.0.0.1 --port 5316 --strictPort

# In another terminal, require the numeric-key candidate:
WORK_MODE=unkeyed WORK_REQUIRE_NUMERIC=1 TARGET_URL=http://127.0.0.1:5316/unkeyed-work.html node benchmarks/js-framework/style-work.mjs
```

Omit `WORK_REQUIRE_NUMERIC=1` to check an unchanged upstream baseline. Set
`WORK_JSON=/path/to/result.json` to retain the machine-readable gate result.

### Nested de-opt list key work gate

The opt-in `nested` mode uses three independent 1,000-row descriptor lists through
the same compiled `.tsrx` child hole. One list is wrapped in a same-kind array
with a top-level sibling, giving its implicit leaves a real nested path; the
second stays flat as a no-work control. A third uses the nested shape with every
row explicitly keyed, checking that an implicit prefix is never prepared for
fully keyed siblings. Each also contains a separate explicit key `"0"`; in the
first two modes it sits beside implicit index zero. An unrelated update uses a
different, prebuilt descriptor generation, so descriptor construction is outside timing.
The gate checks order, complete inner HTML, survivor DOM identity, typed
uncontrolled inputs, and focus. A `JSON.stringify` observer installed before
the production module loads reports calls for nested implicit identities,
nested explicit keys, and any shared wrapper-path serialization. Observation
finishes in a separate browser context before the clean timing run.

From the repository root, build the separate fixture while the runtime is at
the baseline revision. This uses the normal minified production build:

```bash
cd benchmarks/js-framework/octane-tsrx
../../../node_modules/.bin/vite build --config vite.config.nested.js --outDir dist/nested-work-baseline
../../../node_modules/.bin/vite preview --config vite.config.nested.js --outDir dist/nested-work-baseline --host 127.0.0.1 --port 5317 --strictPort
```

From a second terminal at the repository root, record the baseline:

```bash
WORK_MODE=nested WORK_EXPECT_NESTED_JSON=1000 WORK_EXPECT_PATH_JSON=0 TARGET_URL=http://127.0.0.1:5317/nested-work.html WORK_JSON=/tmp/nested-baseline.json node benchmarks/js-framework/style-work.mjs 30
```

After a runtime change, build with `--outDir dist/nested-work-candidate`, serve
that directory on port 5318, and run the same command with
`WORK_EXPECT_NESTED_JSON=0`, `WORK_EXPECT_PATH_JSON=1`, `TARGET_URL=http://127.0.0.1:5318/nested-work.html`,
and `WORK_EXPECTED_HTML_SHA` set to the baseline output's `htmlSha`. Keep both
built bundles and servers fixed; repeat the identical runner in A–B–B–A order
for timing comparisons. Each of 30 samples measures eight toggled updates,
dividing the elapsed time by eight. The flat and fully explicit lists measure
how much general browser load changes between runs. Absolute timing differences inside this
control's variation are inconclusive; the untimed JSON call counts and
observable state are deterministic gates.

### List key callback work (opt-in)

`WORK_MODE=key-callback` builds and serves a separate fixture with three cases:
512 four-row descriptor lists, 512 four-row native mapped lists, and a compiled
2,048-row `@for` control. Equivalent descriptor/data generations are prepared
before timing. The compiled control retains its row objects across distinct
array generations to exercise pure survivor walks. Mapped generations alternate
numeric and equivalent string keys to protect normalization. Mount, unrelated
update, keyed reorder, and restore must preserve row order, complete inner HTML,
survivor nodes, typed inputs, and focus.

The work observer parses readable production output to locate the two key
callback expressions in the list renderer. Jitless Chromium precise **parent
block** coverage counts executions of those expressions; callback invocation
counts would instead scale with rows and are not a creation count. This gate
reports executed source construction sites, not V8 heap allocations. A second
browser without coverage runs the same semantic checks and timing against a
minified production bundle. The compiled `@for` case guards cost added to the
shared reconciler.

Freeze the baseline's readable and minified artifacts before changing runtime
code; the label selects an ignored `octane-tsrx/dist/key-callback-{label}/`
directory. Run these commands from the repository root:

```bash
WORK_MODE=key-callback WORK_BUILD_LABEL=baseline node benchmarks/js-framework/style-work.mjs 0 --build-only
WORK_MODE=key-callback WORK_BUILD_LABEL=baseline WORK_EXPECT_CALLBACKS=512 WORK_JSON=/tmp/key-callback-baseline.json node benchmarks/js-framework/style-work.mjs 30 --no-build
```

Build the candidate separately, then pass the baseline's `semanticSha` to check
all phases' complete markup. The candidate gate requires zero key callback
constructions in each list case:

```bash
WORK_MODE=key-callback WORK_BUILD_LABEL=candidate node benchmarks/js-framework/style-work.mjs 0 --build-only
WORK_MODE=key-callback WORK_BUILD_LABEL=candidate WORK_EXPECTED_HTML_SHA=YOUR_BASELINE_SHA WORK_JSON=/tmp/key-callback-candidate.json node benchmarks/js-framework/style-work.mjs 30 --no-build
```

Zero samples run only semantic/work checks. Once both full gates pass, add
`--timing-only` to skip repeating the jitless observer while retaining all clean
semantic checks. Keep artifacts fixed and compare identical `--no-build` runs
in A–B–B–A order. Update and reorder cases have 16 warmup operations and 30
samples of eight operations, except the very cheap pure compiled update uses
256 operations per sample for timer resolution. `--compiled-update-only` isolates
that timing while retaining every semantic case. Override
`WORK_COMPILED_UPDATE_BATCH=8` to examine the shorter warmup run. Mount has four
warmups and 30 single-mount samples, with unmount cleanup outside timing. Output includes median/p95 latency,
Node/Chromium versions, artifact checksums, and minified raw/gzip JS bytes.
Differences within control or process variance are inconclusive.

Measured on 2026-09-11 against frozen baseline
`2a667f91b538d028c30ba198b807ed5db373ebb3`, Node 26.4.0, Chromium
149.0.7827.55, Darwin 25.6.0 arm64. Four fresh processes per revision ran in
A–B–B–A–A–B–B–A order without concurrent tests. Ranges below are the per-process
median latencies in milliseconds; the pure compiled update uses the separate
256-operation comparison. Other cells use the original eight-operation run.

| Case | Operation | Baseline median range (ms) | Candidate median range (ms) |
| --- | --- | --- | --- |
| 512 descriptor lists | Mount | 5.200–6.000 | 5.400–5.600 |
| 512 descriptor lists | Update | 1.325–1.637 | 1.325–1.450 |
| 512 descriptor lists | Reorder | 14.613–15.875 | 14.513–14.888 |
| 512 mapped lists | Mount | 3.900–4.200 | 3.700–4.100 |
| 512 mapped lists | Update | 0.475–0.588 | 0.487–0.488 |
| 512 mapped lists | Reorder | 13.750–15.425 | 13.638–14.100 |
| Compiled 2,048-row control | Mount | 3.000–3.500 | 2.800–3.100 |
| Compiled 2,048-row control | Pure update (256 per sample) | 0.0090–0.0102 | 0.0094–0.0102 |
| Compiled 2,048-row control | Reorder | 14.625–15.938 | 14.625–16.125 |

All ranges overlap, so these timings support no throughput claim. The original
short compiled-update run had quantized medians of 0.0125 ms baseline versus
0.0250 ms candidate. Increasing the batch also increases optimization exposure,
so the steady result does not rule out an early-run cost. A focused three-way
comparison found identical approximately 0.0082 ms steady medians for baseline,
the shared helper, and an inline-dispatch alternative. The inline alternative's
short-run medians ranged from 0.0125 to 0.0250 ms and added another 226 raw / 78
gzip bytes, providing no consistent benefit for the extra duplication.

Deterministic work fell from 512 to zero executed callback constructions for
**each** descriptor-list phase and independently for **each** mapped-list phase.
Only one of the two source branches executes per list. The compiled control
executes neither branch. Both revisions pass every order, identity, input, focus,
and observed/minified parity gate; the combined complete-markup SHA-256 is
`d07aceedd3930d72653bfc9a08da00722199d3a8ea61f69325c470172a3b01a4`.

Minified fixture JS changed from 176,950 to 177,057 raw bytes and 56,488 to 56,526
gzip bytes (+107 / +38). Asset-set SHA-256 values are
`6a5fca951bdd27d1e1eb3dad0d9372b69859daaa0e29d0336af7da7de40372b9` (baseline)
and `6b19ce09eb24956a00c0da2bdb26557b3bba227ed65aa1b4c2e3492e549522a8` (candidate).

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

- **Bounded reorder-scratch gate.** After all timing samples, Octane's two
  dialects repeat reverse, rotation, shuffle, and small-displacement operations
  over 1,000 and 10,000 keyed rows. A transparent typed-array constructor trap
  rejects allocations after the initial warmup while independently checking
  survivor identity and final order. A contiguous append must remain
  allocation-free, an oversized 18,000-row reorder must not evict reusable
  storage, and an explicit browser garbage collection bounds retained observed
  scratch backing storage to 128 KiB.

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
