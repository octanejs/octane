# js-framework-benchmark — octane

DOM-based benchmark that mirrors the canonical
[js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)
suite. Drives the same six-button + table fixture against `octane` and times
each operation via Playwright.

This complements the Node-only [`tracked-values`](../tracked-values.js)
micro-suite by measuring end-to-end render performance — which is where the
auto-callback transform and stable event-bundle optimization pay off.

## Layout

```
benchmarks/js-framework/
├── octane-tsrx/    # Vite app, dev server on :5176 — octane authored in .tsrx
├── octane-jsx/     # Vite app, dev server on :5177 — same app authored in React-style .tsx
├── run.mjs             # Playwright harness — drives each target N iterations
├── package.json        # umbrella; depends on playwright
├── results/            # output / scratch
└── README.md           # this file
```

The octane app is authored **twice** over the same octane core — once in `.tsrx`
(directive syntax) and once in React-style `.tsx` (JSX). Both emit the same DOM
and expose the same six-button + table contract, but they exercise **different
list-reconciliation paths**, which is the interesting part of comparing them:

- **`octane-tsrx`** — `@for (const row of items; key row.id)` compiles to octane's
  keyed **fast path** (`forBlock`): targeted per-row updates, host node identity
  preserved across re-renders.
- **`octane-jsx`** — `items.map((row) => <tr key={row.id}>…)` compiles to the keyed
  **de-opt list path** (`reconcileKeyed`): still keyed (reorders/swap are correct),
  but each row rebuilds its host DOM on every parent re-render and node identity is
  not preserved. This is octane's React-JSX backwards-compat path.

So the harness's jsx/tsrx ratio is **not** expected to be ~1.0 on the re-render
ops (`update`, `select`, `swap`, `remove`) — it quantifies the cost of the
`.map` de-opt path vs the compiled `@for` fast path. `run` / `runlots` / `clear`
(pure mount/unmount, no keyed re-render) should be much closer.

## Quick start

```bash
# 1. From the repo root, install + sync workspaces:
pnpm install

# 2. Start BOTH octane bench dev servers (separate terminals):
pnpm --filter octane-tsrx-jsbench dev   # :5176
pnpm --filter octane-jsx-jsbench dev    # :5177

# 3. Run the harness (another terminal). By default it drives both dialects and
#    prints the jsx/tsrx ratio (~equal = parity):
pnpm --filter octane-js-framework-benchmarks bench
# or for a longer sample (16 iterations × all 8 ops):
pnpm --filter octane-js-framework-benchmarks bench:long
```

To drive just one dialect, pass a `TARGETS` env (see `run.mjs`).

Output is a table of median + min millis per operation: `run`, `replace`,
`update`, `select`, `swap`, `remove`, `clear`. The harness uses
`page.evaluate(el.click)` to fire clicks synchronously inside the page — avoids
per-click CDP IPC overhead (~10ms each on Chromium) so the numbers reflect the
renderer's wall time, not Playwright transport.

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
