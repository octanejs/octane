# Octane runtime improvement: skip abandoned replay waits

This is a **runtime before/after comparison with unchanged application code**.
The change is in `packages/octane/src/runtime.server.ts`, not in the benchmark's
fetching, caching, boundary layout, or compiler output.

## Result

Production-compiled Octane in local workerd, 20 ms backend delay, 21 measured
requests per case (three rounds of seven, after two warmups):

| Unchanged scenario                            | Metric               |  Baseline | Candidate | Reduction |
| --------------------------------------------- | -------------------- | --------: | --------: | --------: |
| Opaque parent-created promises, blocked root  | Body-first-byte TTFB | 304.19 ms | 261.90 ms |     13.9% |
| Same promises behind an outer shell boundary  | First resolved data  | 302.69 ms | 261.02 ms |     13.8% |
| Same promises with individual card boundaries | Stream completion    | 109.10 ms |  65.97 ms |     39.5% |
| Parent-local ordinary `useMemo`, blocked root | TTFB                 | 304.25 ms | 261.50 ms |     14.1% |

**The 20% TTFB target was not reached.** The larger per-card result is stream
completion, not TTFB. Shell first-byte differences are small and noisy. These
results do not measure the Cloudflare adapter wrapper or a deployed application.

The blocked-root baseline range was 300.76–311.55 ms; the candidate range was
257.29–277.44 ms. Every round improved: 13.1–14.8% by round median. Per-card
completion improved 36.8–39.8% across round medians. Parent invocations/backend
calls fell from 15/150 to 14/140 for the blocked root, and from median 6/60 to
5/50 for per-card streaming. Duplicate work remains; it is not a new cache.

## What changed in Octane

1. Initialize the existing recreation guard with the actual creation-cache size
   of the first pending pass. Previously its artificial `-1` baseline spent a
   retry merely establishing that size.
2. When the existing two-strike guard disables batching, immediately retry once
   to collect per-site suspensions. Do not first wait for the batch that the
   canonical retry is about to replace.
3. Observe all abandoned promise rejections without awaiting or inserting their
   results into the per-site replay cache. Directly thrown resources and warmed
   work need this even when ordinary batch promises already have subscribers.

The same runtime behavior applies to buffered rendering, pre-shell root retries,
and boundary streaming. Genuine dependency consumption, creation-cache growth,
and completed boundaries still reset the guard. Abort checks, attempt bounds,
per-site value semantics, request isolation, and output ordering are retained.
There is no new per-component or per-`use()` work and no cross-request cache.
One guard-state object is initialized earlier for suspended requests; the
no-suspense path is unchanged. The minified benchmark Worker grows by 145 bytes,
from 64,486 to 64,631 bytes (+0.22%). Cold-start impact was not measured.

A broader compiler candidate was rejected during review: caching an ordinary
setup call can freeze a snapshot returned by a live mutable receiver. No part
of that compiler optimization or its proposed runtime helper remains.

## Controls and limitations

All 30 cases passed their applicable content, stream-shell, error, backend-work, and
request-isolation checks at both 20 ms and zero backend delay. SHA-256 checks
confirm `Pages.tsrx`, `data.ts`, `worker.ts`, `backend.js`, and `run.mjs` are
identical between baseline and candidate.

At 20 ms, unaffected blocked-root controls remained approximately unchanged:
inline creation 23.47 → 22.95 ms; independent fetches 22.42 → 22.88 ms; genuinely
dependent fetches 64.75 → 64.80 ms. Their timing ranges overlap. The dependent
control still has only one active backend call; independent work still overlaps.

At zero delay, local blocked-root TTFB was 4.71 → 4.06 ms and per-card completion
2.54 → 1.85 ms, but individual ranges overlap. These sensitivity results include
fetch/dispatch/stream overhead and are not CPU measurements.

An additional short control compared the existing `ssr-throughput` Part-2
production bundles in one Node process, alternating order for three rounds
(200 ms warmup and 700 ms sampling per case/side). All eight cases had exactly
matching HTML and CSS: waterfall depths 1/4, nested depth 4, parallel width 3,
compiled/descriptor pages, escaping, and static control flow. Round timing
ranges overlapped. This does not establish a CPU win or exclude small common-path
regressions; the measured improvement is removal of unnecessary waits.

The full adapter build remains unverified: the locked
`@ripple-ts/adapter@0.3.125` was unavailable from the configured registry. No
dependency stubs, production deployment, or external backend was used.

## Evidence and reproduction

Baseline: `a6ffaefd65a25802800e69a752c8b1c85476c9e3`. Candidate: the runtime-only
working-tree diff against that commit. [Checked-in results](core-retry-results.json)
include source/fixture hashes, environment, all case medians/ranges, and round
medians. Node 26.4.0, Apple M5 Max/macOS arm64, Vite 8.1.5, Miniflare
4.20260714.0, workerd 1.20260714.1, compatibility date 2026-07-14; parser versions
are also recorded. The benchmark files must be identical in both worktrees.

Run on each source revision, with distinct output names:

```sh
BENCH_JSON=benchmarks/results/octane-core-retry-final-20ms.json \
  node benchmarks/ssr-workerd/fetch-patterns/run.mjs 7
BENCH_DELAY_MS=0 BENCH_JSON=benchmarks/results/octane-core-retry-final-0ms.json \
  node benchmarks/ssr-workerd/fetch-patterns/run.mjs 7
```

Local raw baseline artifacts are `octane-core-fetch-baseline-{20,0}ms.json`;
candidate artifacts are `octane-core-retry-final-{20,0}ms.json`, under the ignored
`benchmarks/results/` directory. The optional Node control artifact is
`octane-core-retry-throughput.json`; the checked-in summary is durable without
those local files.

## Correctness and review

- 410 tests passed across 22 development/production-compilation file runs:
  prop-flow, parallel use, use-chain memoization, Suspense/isolation/rejection,
  hydration, streaming, stream-state regressions, and injection/backpressure.
  Frozen-AST and source-location assertions were enabled.
- Added live mutable receiver, abandoned batch/direct-throw/warm rejection, and
  abort-followed-by-next-request regressions. The direct-throw test failed with
  an unhandled rejection before the abandonment cleanup was added, then passed.
  The live-receiver test catches the discarded compiler approach.
- Core TypeScript validation passed with lock-matching runtime dependencies.
  Its cached TSRX typecheck wrapper was 0.3.120 rather than the unavailable
  locked 0.3.126. This is supplemental local validation, not full repository CI.
- Review preserved the two-strike consumption proof, the one-shot retry flag
  across shell publication, and rejection observation without stale cache writes.
  This section records local validation at measurement time; current-head CI
  status is reported on the pull request.
