# Initial validation — 2026-08-29 (Europe/London)

These measurements validate the new synthetic workloads. They are **not a
framework before/after comparison**, a calibrated application profile, or a
Cloudflare-adapter/deployed-edge performance claim. No runtime source changed.

Environment: Apple M5 Max, macOS arm64, Node 26.4.0, Vite 8.1.5, Miniflare
4.20260714.0, workerd 1.20260714.1, TSRX core 0.1.61; compatibility date
2026-07-14. Framework revision: `96c86fcd97f4fe8a158e360a6c6af6b4411ed32c`.
Combined worker: 67,994 bytes raw / 22,229 gzip, identical in all three runs.

## Commands and retained evidence

From the repository root:

```bash
BENCH_JSON=benchmarks/results/app-workloads-baseline-b.json node benchmarks/ssr-workerd/app-workloads/run.mjs 7
BENCH_SCALE=4 BENCH_JSON=benchmarks/results/app-workloads-scale4.json node benchmarks/ssr-workerd/app-workloads/run.mjs 7
BENCH_JSON=benchmarks/results/app-workloads-baseline-c.json node benchmarks/ssr-workerd/app-workloads/run.mjs 7
```

Each run contains eight cases × three rounds × seven samples: 168 measured
requests, after two warmups per case and untimed correctness/cache priming.
All **504 measured requests** passed the output and request-graph checks.
All three raw reports remain in the ignored local results directory and carry
individual samples, dependency events, environment and hashes. Their fixture,
verifier, shared-helper, runtime and lockfile hashes match the final source.
An earlier exploratory run was excluded after the verifier was reformatted;
it is not the repeated-input evidence reported here.

## Same-input repetitions

Scale 1, base delay 15 ms, medians in milliseconds. B and C are separate fresh
workerd runs of the **same code**, not baseline and optimized implementations.

| Case | TTFB B / C | First content B / C | Completion B / C |
| --- | ---: | ---: | ---: |
| workspace/zero-delay | 1.49 / 2.75 | 3.01 / 4.86 | 3.21 / 4.89 |
| workspace/io | 1.65 / 3.24 | 51.82 / 55.89 | 96.73 / 101.13 |
| workspace/io-blocked-root | 34.73 / 39.80 | 51.42 / 58.46 | 96.52 / 102.06 |
| workspace/warm-data | 1.18 / 3.65 | 1.94 / 4.89 | 2.10 / 4.92 |
| history/zero-delay | 1.07 / 3.50 | 2.45 / 6.57 | 3.40 / 7.71 |
| history/io | 1.14 / 3.22 | 34.99 / 42.67 | 97.28 / 108.64 |
| history/io-blocked-root | 18.01 / 19.10 | 34.95 / 37.46 | 97.10 / 100.53 |
| history/warm-data | 1.01 / 1.72 | 2.15 / 3.81 | 2.94 / 4.98 |

The control distinguishes an early loading shell from primary data and full
completion. Removing the outer boundary moves bootstrap waiting into TTFB;
it does not remove data work. Warm-data removes backend calls intentionally
and must not be described as an Octane runtime optimization.

**Timing repeatability is insufficient for a 20% regression/improvement gate on
this machine.** Some low-latency medians more than doubled between identical
runs. Run C's history/io completion p95 was 152.63 ms, versus 98.11 ms in B;
the cause of this variance was not isolated. Do not choose the faster run,
treat the repeated-run difference as a code effect, or install absolute CI
thresholds from these values. Use controlled, paired framework revisions and
repeat runs before making a small latency claim. The weekly smoke gates only
correctness, not these absolute timings.

## Size and correctness controls

At scale 4, workspace renders 192 navigation links and 72 tiles; history renders
160 rows and 24 related items. Exact checked leaf counts grow from 267 → 1,059
and 527 → 2,105 respectively. Streamed wire sizes grow from 42.6 → 155.8 KiB
and 85.4 → 330.6 KiB. Unique backend calls remain seven/nine (zero for warm
data), so this control increases tree/serialization work without extra data
sources. Its timings are retained as diagnostics, not a scaling-ratio claim.

The real-workerd preflights also passed shell-before-data, content-before-tail,
concurrent cold/warm tenant isolation, changed-size cache-key isolation, complete
draining and all eight cases. The oracle's 17 corruption/acceptance tests and
61 existing CI-workflow tests passed. Benchmark typecheck and formatting passed
using the locally available TSRX checker/formatter 0.3.120 with TypeScript 5.9.3
and Prettier 3.9.6; the locked TSRX validation tools 0.3.126 were unavailable.
Performance compilation used the exact installed TSRX core 0.1.61 and real new
worktree framework source. Full remote CI has not been run for these additions.
