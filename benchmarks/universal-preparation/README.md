# Universal preparation walks

This deterministic Node benchmark counts blueprint visits in optional compact
transaction trials and compact-list expansion. It renders ordinary flat hosts,
nested child components, and compiler-style compact lists at 0, 128, and 1,024
rows through the public universal root and object driver.

Each case mounts once and accepts 64 changed-prop updates. Clean and observed
production bundles must preserve final props, host identity, accepted batch
versions, and complete teardown. Compact lists are a control: their markers
still require expansion under their ordinary parent host. The observer must
report that work, and the paired comparison requires its counts to stay equal.

```bash
node benchmarks/universal-preparation/run.mjs
node benchmarks/universal-preparation/run.mjs 1bc1926e809b6f1958dbc274dc68ad1334f68efc
BENCH_SOURCE_REF=HEAD node benchmarks/universal-preparation/run.mjs --measure
```

`BENCH_SOURCE_REF` selects the candidate core source; the optional positional
revision selects a baseline. Both use the same installed toolchain and remaining
source files. `--measure` reports an older candidate without enforcing the new
zero-work guard. `BENCH_JSON` writes the standard benchmark result. This is a
work-count comparison, with no wall-clock, browser, native-device, or application
throughput claim.

## Recorded comparison

Node 24.20.0 / Darwin arm64, against
`1bc1926e809b6f1958dbc274dc68ad1334f68efc`, for 64 updates:

| Case | Expansion visits before / after | Compact-leaf trial visits before / after |
| --- | ---: | ---: |
| ordinary-0 | 64 / 0 | 0 / 0 |
| ordinary-128 | 8,256 / 0 | 64 / 0 |
| ordinary-1024 | 65,600 / 0 | 64 / 0 |
| owners-0 | 128 / 0 | 64 / 0 |
| owners-128 | 16,512 / 0 | 64 / 0 |
| owners-1024 | 131,200 / 0 | 64 / 0 |
| compact-0 / compact-128 / compact-1024 | 128 / 128 | 64 / 64 |

Template trials already reject these drivers without walking nodes. Required
stable-leaf matching visits remain unchanged. The `preparation-work` reference
target supplies the fixed 64-update denominator for zero-ratio guards.
