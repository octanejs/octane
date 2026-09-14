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
limited to the feature scan. This measures removed work, not application timing.
