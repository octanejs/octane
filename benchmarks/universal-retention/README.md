# Universal committed subtree retention

This deterministic Node benchmark counts committed logical nodes visited to
recover a subtree's feature flags. It drives 64 accepted state updates beside
an unchanged child with 0, 128, or 1,024 hosts. Changed-child controls require
fresh output. Both clean and observed production bundles must preserve labels,
host identity, and complete unmount cleanup.

```sh
node benchmarks/universal-retention/run.mjs
UNIVERSAL_SOURCE_ROOT=/path/to/baseline node benchmarks/universal-retention/run.mjs
```

`BENCH_JSON` writes benchmark-schema results. The source root may be a frozen
source archive; dependencies always come from this checkout. Instrumentation is
limited to the feature scan and retained Suspense range lookup. This measures
removed work, not application timing.

The Suspense scenarios mount 0, 32, 128, or 512 independently keyed boundaries,
then suspend none, the last one, or all of them. After one warmup, three samples
count logical records visited by range searches during that update. Retention
entry counts prove that the pending boundaries still execute. Clean and observed
production bundles must preserve primary host identities and ordering, hide only
pending primary content, publish the correct fallbacks, recover the same hosts
with resolved values, and release every host on unmount.

The flat fixture's root-search baseline visits `2N(N + 1)` records when all N
boundaries suspend, `4N` when only the last suspends, and zero when none suspend.
These are individual record visits across searches, not full-tree traversal
counts. The ratio guards require zero range-search visits for committed arms;
other retention, reconciliation, and host publication work remains. Results
describe the Node object driver, not browser DOM or device/Hermes latency.

```sh
node benchmarks/bench.mjs universal-retention --ratios
```
