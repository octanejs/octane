# async-waterfall

Measures how each framework's **async data model** handles a 10-level nested
async tree. Every level fetches its own independent data (16ms simulated
latency, identical `src/data.js` in every app) and renders the next level as
its child.

| op | what happens |
| --- | --- |
| `init` | mount → deepest level rendered |
| `update` | version bump (a transition for React/octane, a signal/tracked write for Solid/ripple) → deepest level shows the new value |

## What it demonstrates

- **octane / React** (`use(fetch)` under `<Suspense>`, `startTransition`
  updates): level N+1 doesn't mount — and doesn't *start fetching* — until
  level N's promise resolved, so the fetches **serialize**: init/update land
  near the waterfall floor of `LEVELS × DELAY` (~160ms). This is idiomatic
  nested `use`, deliberately NOT hand-hoisted — the suite pins the model cost.
- **Solid 2.0** (async memos: a memo whose compute returns a promise
  auto-unwraps and throws `NotReadyError` into a per-level
  `createLoadingBoundary`) and **ripple** (per-level tracked value filled by an
  effect-driven fetch): the whole tree is created immediately, all fetches
  start in **parallel** — init/update land near the `DELAY` floor (~16-18ms),
  and updates are fine-grained writes with no re-render cascade.

Recorded medians (2026-07-08): octane-tsrx init 174.8ms (10.9× floor) /
update 172.4ms; React init 305.1ms (19.1× — its suspense retry scheduling
roughly doubles its own waterfall) / update 173.9ms; solid 18.4/17.6ms;
ripple 18.2/17.6ms.

## Guards

Only octane-vs-React is ratio-guarded (both are waterfall-by-model; octane
must stay at-or-under React). Octane is deliberately NOT guarded against
solid/ripple: the ~10× gap is the model, and closing it is planned work —
compiler-parallelized `use` (docs/suspense-parallel-use-plan.md). When that
lands, tighten the guards and add octane-vs-solid/ripple ceilings so the win
can't regress.

## Running

```bash
node benchmarks/bench.mjs async-waterfall            # orchestrated (servers auto-boot)
pnpm --filter octane-tsrx-async-bench dev            # or drive one app by hand on :5216
node benchmarks/async-waterfall/run.mjs 10
```

Each app implements the same window contract: `__init(): Promise<ms>` (fresh
page only — the promise cache must be cold) and `__update(): Promise<ms>`;
completion is detected with a MutationObserver on the deepest level's text.
