# signal-favoring bench

A second adjacent benchmark to [`recursive-context`](../recursive-context/). The
recursive-context bench measures wide fan-out across a balanced binary tree. This
one measures the **signal vs hook update cascade** along a deep linear chain.

The bench is named honestly: it has a structural bias toward fine-grained
reactivity (Solid, Ripple, Svelte, Vue Vapor) over hook-based reactivity
(React, Preact, Octane). When
state changes at a mid-chain node, signal frameworks re-evaluate **only the text
expression that read the signal** — they don't re-render any component bodies.
Hook frameworks re-render the owning component, which cascades through every
descendant unless wrapped in `memo`.

The point of the bench is not to declare a winner — it's to **quantify how much
the cascade actually costs** in absolute terms. Often less than you'd expect.

## Layout

```
benchmarks/signal-favoring/
├── octane-tsrx/       # Vite app, dev :5190 — octane authored in .tsrx
├── octane-jsx/        # Vite app, dev :5194 — same app authored in React-style .tsx
├── solid/             # Vite app, dev :5191 (Solid 2.0 beta)
├── react/             # Vite app, dev :5192 (React 19)
├── ripple/            # Vite app, dev :5193
├── vue-vapor/         # Vite app, dev :5183 — Vue 3.6 Vapor: 100 SFCs, one per chain
│                      #   link (Vue is one component per SFC); bumps return nextTick()
├── preact/           # Vite app, dev :5265 — Preact hooks/VDOM cascade
├── svelte/           # Vite app, dev :5276 — Svelte 5 runes, 100 generated SFCs
├── gen.mjs            # Source generator for the App fixtures (scaffold; see note below)
├── run.mjs            # Playwright harness — drives all adapters
├── package.json       # umbrella: `pnpm bench`
└── README.md
```

The octane app is authored twice — `.tsrx` (directive `@{ … }`, `class`,
`{v as number}`) and React-style `.tsx` (`return <jsx>`, `className`, `{v}`) — over
the same octane core, so the two octane columns read the JSX backwards-compat
path's cost for this hook-cascade workload.

## Shape

A linear chain of 100 uniquely-named components `C1 → C2 → ... → C100`. Each
component renders a `<div>` with its index and its child component. Stateful
counters live at every tenth position: `C1, C11, C21, ..., C91` (10 stateful in
total).

Each stateful component owns its own counter via the framework's native primitive:

| framework        | primitive                | what a `setN(v+1)` triggers                                            |
| ---------------- | ------------------------ | ---------------------------------------------------------------------- |
| **octane-tsrx**  | `useState` (React-shape) | re-render of `CN`, cascade through `CN+1 .. C100`                      |
| **octane-jsx**   | `useState` (React-shape) | re-render of `CN`, cascade through `CN+1 .. C100`                      |
| **react**        | `useState`               | re-render of `CN`, cascade through `CN+1 .. C100`                      |
| **solid**      | `createSignal`           | re-evaluate the `{v()}` text expression in `CN`; descendants untouched |
| **ripple**     | `track()`                | re-evaluate the `{v}` text expression in `CN`; descendants untouched   |
| **vue-vapor**  | `shallowRef`             | re-run the `{{ v }}` text renderEffect in `CN`; descendants untouched  |
| **preact**     | `useState`               | re-render of `CN`, cascade through `CN+1 .. C100`                       |
| **svelte**     | `$state`                 | re-run the value text effect in `CN`; descendants untouched            |

Generator-driven so the chain length, stateful spacing, and per-component shape
stay consistent across frameworks. Edit `gen.mjs` and re-run `node gen.mjs` to
regenerate the component fixtures (octane-tsrx, octane-jsx, ripple, react,
solid, preact, and the Svelte SFC chain).
The vue-vapor chain is the same shape spread over 100 SFC files (Vue is one
component per SFC), with the stateful links registering their bump closures in
`src/bumps.js`; Vue has no public synchronous flush, so every `__bumpAtN`
returns `nextTick()` and the harness awaits it inside the timed window (and
between reps, so bumps can't coalesce into one commit).

> **Note:** `gen.mjs` deliberately regenerates component-chain sources only.
> The `main.*` adapters stay hand-maintained because the `__sweepBatched` /
> `__sweepBatchedReverse` globals and flush semantics differ by framework.

Native **Preact** (`:5265`) deliberately uses hooks, making it a cascade/VDOM
column rather than a signals variant. **Svelte 5** (`:5276`) uses 100 generated
runes-mode SFCs, so a scalar write updates its owning text effect without
recreating descendants.

## Measurements

- **MOUNT** — initial render of all 100 components.
- **BUMP_SHALLOW** — `__bumpAt1()`. Hook frameworks cascade through 99 components;
  signal frameworks update one text node. This is the bench's worst case for
  hooks.
- **BUMP_MIDDLE** — `__bumpAt51()`. Hook frameworks cascade through ~50
  components.
- **BUMP_DEEP** — `__bumpAt91()`. Hook frameworks cascade through ~10 components.
  As the depth gets closer to the leaf, the cost converges with signal frameworks.
- **BUMP_SWEEP** — bump every stateful component, flushing after EACH bump (10
  separate commits). The no-coalescing worst case.
- **BUMP_SWEEP_BATCHED** — the same 10 bumps in ONE flush, queued ANCESTOR-first
  (`__bumpAt1 … __bumpAt91`). A framework that coalesces overlapping cascades
  renders each component once instead of once-per-bump.
- **BUMP_SWEEP_REVERSE** — the same single batched flush, queued DESCENDANT-first
  (`__bumpAt91 … __bumpAt1`). Exposes whether coalescing depends on the order
  updates were queued in: a scheduler that drains in tree order (and signal
  frameworks, which don't cascade) is unaffected; one that coalesces only in queue
  order de-coalesces back toward the per-bump cost.
- **UNMOUNT** — full teardown via the framework's unmount API.

A single sweep is sub-millisecond, so each sweep op is timed as a tight loop of
25 sweeps divided back down — the per-sweep cost escapes the OS timer's ~0.1ms
quantization floor.

The harness also prints three derived ratios per target:

- **cascade ratio** — `bump_shallow / bump_deep`. Hook frameworks land around 10×
  (99 vs 10 cascading renders); signal frameworks near 1×.
- **coalescing ratio** — `bump_sweep_batched / bump_sweep`. How much one flush
  saves over ten; further below 1× = bigger batching win.
- **order-sensitivity ratio** — `bump_sweep_reverse / bump_sweep_batched` (on
  means). ~1× means coalescing is independent of update order; >1× means
  descendant-first batches cost more than ancestor-first ones.

## Quick start

```bash
# 1. From the repo root, install:
pnpm install

# 2. (Optional) regenerate fixtures if you edited gen.mjs:
node benchmarks/signal-favoring/gen.mjs

# 3. Production-build, preview, and drive all eight targets:
node benchmarks/bench.mjs --quick signal-favoring
node benchmarks/bench.mjs signal-favoring
```

## Measurement contract

Each adapter installs these globals on `window`:

| global           | what it does                                                                     |
| ---------------- | -------------------------------------------------------------------------------- |
| `__mount()`      | calls the framework's mount API (deferred — index.html does NOT auto-mount)      |
| `__bumpAt<N>()`  | for N in 1, 11, 21, ..., 91: bumps the counter inside `CN`                       |
| `__sweepBatched()` | bumps all 10 counters ANCESTOR-first (C1→C91) inside one synchronous flush      |
| `__sweepBatchedReverse()` | bumps all 10 DESCENDANT-first (C91→C1) inside one synchronous flush      |
| `__unmount()`    | tears down via the framework's unmount API                                       |
| `__reset()`      | `__unmount()` + clear `target.children` — for between-iteration cleanup          |
| `__ready = true` | last line of `main.{js,jsx}`; harness gates on `page.waitForFunction("__ready")` |

The harness:

- **MOUNT**: fresh `page.goto` per sample.
- **BUMP\_** ops: one page, `__mount()` once, then loop `__bumpAt<N>()` ×
  (warmup + iter).
- **BUMP_SWEEP**: same shape but executes all 10 bumps in a single in-page loop
  before the rAF gate.
- **UNMOUNT**: one page; per iteration `__mount()` (untimed), time `__unmount()`,
  then `__reset()`.

Default: 5 warmups + 20 iters. Pass an integer to `bench` to override iters.
