# Hydration render-phase queue draining

This Node/jsdom suite production-builds a server renderer and a client runtime,
then times only `hydrateRoot` for a root whose rows each converge through two
guarded render-phase updates. An equal-width mounted root already has one update
per row queued ahead of the hydrating root. The 128- and 1,024-row cases share
one process and alternate measurement order.

Every sample verifies that hydration keeps every server-created button,
publishes the converged target state synchronously, leaves the other root stale
until the ordinary scheduler flush, commits that queued foreign work afterward,
handles a delegated click, and unmounts both roots cleanly.

```bash
node benchmarks/hydration-render-phase-queue/run.mjs
node benchmarks/bench.mjs --quick hydration-render-phase-queue
```
