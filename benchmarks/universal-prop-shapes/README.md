# Universal prop shapes

This untimed Node/V8 diagnostic captures actual `universalComponent` prop
snapshots and props passed to the host driver's public batch API. It checks
component keys, ordinary host props, callbacks, null callbacks, lifecycle hooks,
local callbacks, refs, dynamic children, retained host identity, and teardown.
The fallback template case declares template mounting but rejects prepared
program commands, so it exercises ordinary collapsed template event extraction.

Each case renders twelve versions and samples the final eight prop records.
`dictionary_props` counts records for which V8's `%HasFastProperties` is false.
The `normalization-work` reference is the fixed eight-record sample size for
zero-ratio guards. Plain component, ordinary host, ownerless leaf, and compact
leaf cases provide controls.
The default run requires every sampled record to keep fast properties. Use
`--observe` when measuring a baseline with dictionary props. Shape observations
remain in this benchmark; package tests assert consumer behavior.

```bash
node benchmarks/universal-prop-shapes/run.mjs
BENCH_SOURCE_REF=1bc1926e809b6f1958dbc274dc68ad1334f68efc \
  node benchmarks/universal-prop-shapes/run.mjs --observe
```

The script bundles the current universal native entry using the package's
esbuild dependency. `BENCH_SOURCE_REF` substitutes `universal-core.ts` from a
Git revision into that same bundle. `BENCH_RUNTIME_URL` can instead select an
already built runtime; this skips bundling. `BENCH_JSON` writes benchmark-schema
results. The script relaunches Node with `--allow-natives-syntax` if needed.

On Node 24.20.0 / macOS arm64, the frozen baseline and candidate produced equal
SHA-256 output/callback hashes for all twelve cases. Plain, ownerless leaf, and
compact leaf controls retained zero dictionary records. Keyed component snapshots, keyed spread snapshots,
ordinary and fallback host events, null events, reserved host props, lifecycle
hooks, and local callbacks each changed from eight dictionary records to zero.
This establishes the shape change, not a timing or allocation reduction.

Explicit key entries no longer add a key property. A spread containing a key
still runs the native snapshot in getter order, then copies the snapshot without
its key; each such spread adds one ordinary-prop copy. Hosts allocate one fresh
filtered payload only when the first consumed prop is encountered. Ordinary
hosts retain the original allocation. This trades that filtered copy for avoiding
property deletion and dictionary payloads. No DOM, SSR, hydration, native-device,
GC pause, or end-to-end throughput claim is made by this diagnostic.

The ownerless leaf materializer has one caller, reached only when the driver
accepts compiler leaf props. Its callback classification fallback was therefore
unreachable; removing that fallback preserves callback-shaped values as ordinary
driver props on this path. Compact leaf props were already directly constructed.

## Throughput check

`node benchmarks/universal-prop-shapes/run.mjs --timing` measures complete public
root mounts and updates at 128 and 1,024 hosts. Each host has ordinary props;
event hosts add a listener, and callback hosts add an event, lifecycle handler,
and local callback. Fixture construction, output/identity checks, dispatch, and
teardown are outside the timed interval. Updates change ordinary values and keep
callback identities stable. Five warmup rounds precede `BENCH_ITERATIONS` rounds
(default 9), with sixteen updates per sample and reversed case order each round.
The bundles are minified production esbuild outputs; JSON records the bundle
hash, esbuild version, source revision, Node version, V8 version, and platform.

A baseline–candidate–candidate–baseline run with thirteen samples per process on
Node 24.20.0 / macOS arm64 produced the following candidate/baseline ratios,
using the mean of each process's median. All twelve semantic hashes matched.
The engine was V8 13.6.233.17-node.53 and the bundler was esbuild 0.28.1.

Production bundle SHA-256 values were stable in each pair:

- Baseline: `0b4c842274dcb2e5af92f473e413c00b4aa655a047b1d6f6b874a8a7b1a250bd`
- Candidate: `e33b88bf3cd794198e3c7a6d2d9234eb494b76fc19e54dbceee1212897b5b472`

```bash
BENCH_ITERATIONS=13 BENCH_JSON=/tmp/props-baseline.json \
  BENCH_SOURCE_REF=1bc1926e809b6f1958dbc274dc68ad1334f68efc \
  node benchmarks/universal-prop-shapes/run.mjs --timing
BENCH_ITERATIONS=13 BENCH_JSON=/tmp/props-candidate.json \
  node benchmarks/universal-prop-shapes/run.mjs --timing
```

| 1,024 hosts | Mount | Update |
| --- | ---: | ---: |
| Plain control | 0.96× | 0.90× |
| Events | 0.98× | 0.82× |
| Events, lifecycle, local callback | 0.79× | 0.85× |

The candidate includes the accompanying universal materialization and retained
feature changes. Plain controls therefore account for some of the improvement;
these results do not isolate prop filtering's contribution. At 128 hosts the
callback mount medians were 0.369–0.375 ms versus baseline 0.358–0.363 ms
(1.03×); sample standard deviations were 0.052–0.764 ms, including one candidate
timing outlier. At 1,024 hosts, event update medians were 1.135–1.174 ms versus
1.387–1.416 ms baseline; callback update medians were 1.954–1.956 ms versus
2.293–2.294 ms baseline.
The runs show no material regression in these representative mount/update
cases. They do not establish native-engine throughput or the cost of repeated
keyed spreads, and the untimed shape result remains the primary regression guard.
