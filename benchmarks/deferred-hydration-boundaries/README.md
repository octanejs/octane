# Deferred hydration boundary setup

This Node/jsdom suite production-builds Octane's server renderer and client
runtime, then measures `hydrateRoot` for one and 2,048 server-preserved
`<Hydrate when={load()}>` boundaries. Every boundary adopts one server-created
cell. A same-sized plain client mount is the counter-workload for machine-wide
timing drift.

The timed interval contains only `hydrateRoot`. HTML parsing, DOM identity
capture, correctness checks, instrumentation, and unmount are outside it. The
two hydration sizes share one process, receive an untimed warmup, and alternate
measurement order across nine normal samples.

## Allocation guard

An additional untimed pass replaces the JavaScript `Set` constructor with a
semantics-preserving counting subclass while each hydration case runs. The
single-boundary count removes fixed root/runtime setup from the 2,048-boundary
count. The suite fails above 3.05 `Set` allocations per added boundary.

Before lazy waiter allocation, the slope was exactly 4.000 and the 2,048-case
created 8,204 sets. The optimized path is exactly 3.000 and creates 6,156: one
fewer retained empty set per boundary, or 25% fewer setup-set allocations in
this workload. A procedural prefetch that actually calls `waitFor()` still
allocates its waiter set on demand; behavior coverage exercises multiple
concurrent subscribers and the hydrate, prefetch, and abort outcomes.

## Timing evidence

Three independent nine-sample runs on Node 22.22.2 produced these scores in
milliseconds:

| run | eager waiters: 2,048 hydrate | lazy waiters: 2,048 hydrate | eager plain control | lazy plain control |
| --- | ---: | ---: | ---: | ---: |
| 1 | 64.775 | 53.694 | 100.584 | 93.734 |
| 2 | 66.883 | 68.255 | 103.354 | 112.215 |
| 3 | 68.233 | 58.868 | 102.837 | 95.449 |

Normalized against the plain-mount control, the hydration ratio is lower in
every run; absolute hydration time is lower in two runs and nearly flat in the
run where the control also slowed. The allocation slope is the durable claim
and regression gate because the control movement shows why absolute timing
alone is not a reliable CI threshold.

Every sample also proves the boundary count, cell count, server-node identity,
protocol-sidecar cleanup, and complete unmount.

```bash
node benchmarks/deferred-hydration-boundaries/run.mjs
node benchmarks/bench.mjs --quick deferred-hydration-boundaries
```
