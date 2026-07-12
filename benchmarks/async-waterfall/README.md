# async-waterfall

Measures how each framework's **async data model** handles a 10-level nested
async tree. Every level fetches its own independent data (16ms simulated
latency, identical `src/data.js` in every app) and renders the next level as
its child.

| op | what happens |
| --- | --- |
| `init` | mount → deepest level rendered |
| `update` | version bump (a transition for React/Preact/Octane, a fine-grained write for Solid/Svelte/Ripple) → deepest level shows the new value |

## What it demonstrates

- **octane** (`use(fetch)` under `<Suspense>`, `startTransition` updates,
  compiled with the `parallelUse` pipeline — see the app's vite config and
  docs/suspense-parallel-use-plan.md): the code is idiomatic nested `use`,
  deliberately NOT hand-hoisted — the COMPILER memoizes each level's fetch
  creation, batches the suspension, and warm-walks the child chain
  (`Level.__warm`), so **every level's fetch starts in the first attempt**:
  init/update land near the `DELAY` parallel floor (~19-20ms).
- **React** (same idiomatic nested `use`): level N+1 doesn't mount — and
  doesn't *start fetching* — until level N's promise resolved, so the fetches
  **serialize** near (init: roughly double, via retry scheduling) the
  `LEVELS × DELAY` waterfall floor.
- **Solid 2.0** (async memos: a memo whose compute returns a promise
  auto-unwraps and throws `NotReadyError` into a per-level
  `createLoadingBoundary`) and **ripple** (per-level tracked value filled by an
  effect-driven fetch): parallel by model — the whole tree is created
  immediately; init/update land near the `DELAY` floor.

Recorded medians (2026-07-09, parallelUse on): octane-tsrx init 20.1ms
(1.3× floor) / update 19.1ms; React init 307.3ms (19.2×) / update 190.1ms;
solid 19.0/18.6ms; ripple 19.2/17.5ms. (Pre-pipeline, 2026-07-08: octane was
174.8/172.4ms — 10.9× the floor, the waterfall this suite existed to pin.)

## Guards

Octane is ratio-guarded on BOTH sides now: ≤0.25× React (a regression back
toward per-level rounds fails loudly) and ≤1.5× solid/ripple on init+update
(the parallel-floor win the parallelUse pipeline earned must not regress).

- **Preact** uses its documented cached-resource Suspense pattern. A level
  suspends before creating its child, so the nested tree serializes honestly.
- **Svelte 5** uses stable `#await` blocks around each value while rendering the
  recursive child outside the block, starting all independent levels together.

## Running

```bash
node benchmarks/bench.mjs async-waterfall            # orchestrated (servers auto-boot)
pnpm --filter octane-tsrx-async-bench dev            # or drive one app by hand on :5216
node benchmarks/async-waterfall/run.mjs 10
```

Each app implements the same window contract: `__init(): Promise<ms>` (fresh
page only — the promise cache must be cold) and `__update(): Promise<ms>`;
completion is detected with a MutationObserver on the deepest level's text.
