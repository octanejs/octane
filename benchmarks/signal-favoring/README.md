# signal-favoring bench

A second adjacent benchmark to [`recursive-context`](../recursive-context/). The
recursive-context bench measures wide fan-out across a balanced binary tree. This
one measures the **signal vs hook update cascade** along a deep linear chain.

The bench has a structural bias toward fine-grained text updates. Octane uses
its TSRX implementation with `useSignal$` from `octane/signals/client` and binds
each handle directly as `{v$}`. Solid, Ripple, Svelte and Vue Vapor likewise update the text expression
that consumes their native reactive value.

React and Preact use hooks. React Compiler caches eligible unchanged child
elements automatically, so the React column can skip descendant work even though
its stateful owner still re-renders.

The point of the bench is not to declare a winner — it's to **quantify how much
the cascade, compiler-assisted avoidance, or fine-grained update actually costs**
in absolute terms. Often less than you'd expect.

## Layout

```
benchmarks/signal-favoring/
├── octane-tsrx/       # Vite app, dev :5190 — octane authored in .tsrx
├── solid/             # Vite app, dev :5191 (Solid 2.0 beta)
├── react/             # Vite app, dev :5192 (React 19 + React Compiler)
├── ripple/            # Vite app, dev :5193
├── vue-vapor/         # Vite app, dev :5183 — Vue 3.6 Vapor: 100 SFCs, one per chain
│                      #   link (Vue is one component per SFC); bumps return nextTick()
├── preact/           # Vite app, dev :5265 — Preact hooks/VDOM cascade
├── svelte/           # Vite app, dev :5276 — Svelte 5 runes, 100 generated SFCs
├── inferno/          # Vite app, dev :5329 — Inferno component state
├── gen.mjs            # Source generator for the App fixtures (scaffold; see note below)
├── run.mjs            # Playwright harness — drives all adapters
├── work.mjs           # untimed Chromium precise-call-coverage gates for Octane
├── package.json       # umbrella: `pnpm bench`
└── README.md
```

Octane uses `.tsrx` template bodies with component-owned native signals and
`{v$}` text bindings. This suite does not include an Octane JSX target.

## Shape

A linear chain of 100 uniquely-named components `C1 → C2 → ... → C100`. Each
component renders a `<div>` with its index and its child component. Stateful
counters live at every tenth position: `C1, C11, C21, ..., C91` (10 stateful in
total).

Each stateful component owns its own counter via the framework's native primitive:

| framework        | primitive                | what a `setN(v+1)` triggers                                            |
| ---------------- | ------------------------ | ---------------------------------------------------------------------- |
| **octane-tsrx** | `useSignal$` | update the `{v$}` text binding; component bodies and descendants untouched |
| **react**        | `useState`               | re-render of `CN`; React Compiler skips eligible unchanged descendants |
| **solid**      | `createSignal`           | re-evaluate the `{v()}` text expression in `CN`; descendants untouched |
| **ripple**     | `track()`                | re-evaluate the `{v}` text expression in `CN`; descendants untouched   |
| **vue-vapor**  | `shallowRef`             | re-run the `{{ v }}` text renderEffect in `CN`; descendants untouched  |
| **preact**     | `useState`               | re-render of `CN`, cascade through `CN+1 .. C100`                       |
| **svelte**     | `$state`                 | re-run the value text effect in `CN`; descendants untouched            |

Generator-driven so the chain length, stateful spacing, and per-component shape
stay consistent across frameworks. Edit `gen.mjs` and re-run `node gen.mjs` to
regenerate the component fixtures (octane-tsrx, ripple, react,
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
- **BUMP_SHALLOW** — `__bumpAt1()`. An uncached hook cascade can visit 99
  descendants; direct signal bindings, including Octane TSRX, update one text
  node without re-rendering its component.
- **BUMP_MIDDLE** — `__bumpAt51()`. An uncached hook cascade can visit ~50
  descendants; a direct signal binding still updates one text node.
- **BUMP_DEEP** — `__bumpAt91()`. An uncached hook cascade can visit ~10
  descendants. As the depth approaches the leaf, less descendant work remains
  for either compiler memoization or fine-grained reactivity to avoid.
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

A single sweep is sub-millisecond. Each sweep op starts with 25 repetitions and
doubles until a batch spans at least 20 ms, then divides the samples back to
per-sweep costs. The same calibration applies to every framework and every sweep
mode. This avoids zero timings at Chromium's 100 µs clock resolution; it replaces
the old fixed 25-sweep batches. Published bump/sweep rows retain `repeat` and
`sampleMs` so their calibration is auditable.

The harness also prints three derived ratios per target:

- **cascade ratio** — `bump_shallow / bump_deep`. An uncached hook chain trends
  toward 10× (99 vs 10 descendants); React Compiler can lower that ratio by
  skipping eligible descendants, while signal frameworks remain near 1×.
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

The unified runner also executes `work.mjs` against the already-built Octane
preview. Run it directly with `pnpm --dir benchmarks/signal-favoring
bench:work` when that preview is already running.

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
  (warmup + iter). Each timed sample runs a calibrated batch of bumps and
  divides: the batch doubles from 50 until it takes at least 20 ms, so even a
  sub-microsecond bump spans 200 or more ticks of Chromium's 100 µs clock. The
  harness prints the chosen batch size for each op.
- **BUMP_SWEEP**: same shape but executes all 10 bumps in a single in-page loop
  in each repetition, preserving every adapter flush boundary.
- **UNMOUNT**: one page; per iteration `__mount()` (untimed), time `__unmount()`,
  then `__reset()`.

The semantic gate also verifies retained chain hosts and leaf identity across
updates, then remounts to check fresh counter state and working bump closures.
After the semantic gate, the harness publishes a zero-variance mounted DOM
census. Visible element/text counts control for equivalent output; total/comment
counts expose framework bookkeeping. The former JSX/TSRX aliases and their two
dialect ratio guards were removed along with the JSX target; the deterministic
Octane work gate remains.

`work.mjs` uses jitless Chromium precise call coverage rather than source
counters, which would change the program presented to the compiler. It caps
blocks, aggregate component-slot dispatch, child slots, descriptors, and
teardown work at the current production levels while allowing every count to
fall. It also forbids fetch-warming registrations in this fully synchronous
component tree. Every row requires live production-bundle coverage. C1/C51/C91
must still perform exactly one text write, and the ancestor-first batch exactly
ten.

Each individual Octane update must render zero blocks, dispatch zero component
slots, and write exactly one text node. A batched sweep must likewise render no
blocks or component slots and write exactly ten text nodes. Mount and teardown
remain measured and bounded, including the cost of creating and disposing each component-owned signal.

Default: 5 warmups + 20 iters. Pass an integer to `bench` to override iters.
