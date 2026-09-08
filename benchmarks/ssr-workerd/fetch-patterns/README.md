# Fetch-shape SSR performance in workerd

For the **Octane runtime before/after result with unchanged application code**,
see [CORE-RESULTS.md](CORE-RESULTS.md): 13.9% lower blocked-root TTFB and 39.5%
faster per-card stream completion. The 20% TTFB target was not reached. The
application-pattern comparisons below are baseline controls, not improvements
introduced by the runtime patch.

This investigation measures how promise creation, fetch parallelism, and caching
affect Octane SSR first byte and data completion. It uses the current Octane
compiler and renderer in a real local workerd process, with a second workerd
Worker providing backend responses after a controlled delay.

It does **not** measure the app-core/Cloudflare adapter wrapper, deployed edge
latency, production cache hit rates, hydration, or billed CPU. There are no
compiler, runtime, or dependency stubs. The full adapter build was unavailable
in the investigation environment because its locked `@ripple-ts/adapter@0.3.125`
was not available from the configured registry. These are renderer/data-shape
measurements, not a claim of a deployed application's TTFB improvement.

## The 50-pass warning is historical

The [prop-flow fix and recreation guard](../../../docs/suspense-parallel-use-plan.md)
landed on 2026-07-20. The current runtime no longer livelocks on the measured
parent-created-promise shape, but opaque creations can still repeat substantial
work before the guard restores progress.

The cases in [Pages.tsrx](Pages.tsrx) separate three things that otherwise look
similar:

```tsrx
// Opaque creation: a fresh set of promises on each parent invocation.
const cards = props.work.makeCards();
<Cards cards={cards} eachBoundary={props.work.eachBoundary} />

// Eligible inline prop creation: compiler-cached across SSR replays.
<Cards cards={props.work.makeCards()} eachBoundary={props.work.eachBoundary} />

// Stable request preparation: create once in the request handler, before render.
<Cards cards={props.work.cards} eachBoundary={props.work.eachBoundary} />
```

These are alternative component-body excerpts, not one component. The inline
optimization is deliberately conservative; it is not a guarantee for arbitrary
locals, spreads, hooks, mutations, or foreign component bodies. A request-local
loader cache also stabilizes the underlying promises without requiring the
compiler to recognize their creation site.

Ordinary server `useMemo(() => makeCards(), [work])` is a negative control, not
a solution: server hook state is scoped to the component invocation and does
not survive these Suspense replays. The compiler's `puMemo` creation cache has
a different, render-request lifetime. The existing
[prop-flow regression suite](../../../packages/octane/tests/ssr-prop-flow-promises.test.ts)
pins the intended inline and opaque behavior.

## Baseline application-pattern comparisons (not runtime improvements)

Final post-review run: 2026-08-28, source commit
`a6ffaefd65a25802800e69a752c8b1c85476c9e3`, Apple M5 Max, macOS arm64,
Node 26.4.0, Miniflare 4.20260714.0, workerd 1.20260714.1, compatibility date
2026-07-14. Vite 8.1.5 compiles the authored fixtures with this checkout's
Octane compiler, `@tsrx/core` 0.1.61 and `oxc-tsrx` 0.5.0. The single bundled
renderer Worker is 64,486 bytes; every candidate uses that same bundle.

The backend waits 20 ms per fetch. All rows are medians of 21 measured requests
per case, after warmup. Percentages are reductions in elapsed time, not
throughput increases or CPU savings.

| Comparison                                                      | Metric               | Before → after  | Reduction                       | Backend calls/request |
| --------------------------------------------------------------- | -------------------- | --------------- | ------------------------------- | --------------------- |
| Opaque parent-local → stable inline, no boundary                | Body-first-byte TTFB | 318.0 → 24.6 ms | 92.3%                           | 150 → 10              |
| Same change, one outer shell boundary                           | First resolved data  | 321.8 → 23.5 ms | 92.7%                           | 150 → 10              |
| Same change, individual card boundaries                         | Stream completion    | 116.6 → 25.1 ms | 78.5%                           | 60 → 10               |
| Three serial → three parallel fetches, no boundary              | TTFB                 | 68.6 → 23.8 ms  | 65.4%                           | 3 → 3                 |
| Child-local fetches: one outer boundary → per-card boundaries   | Stream completion    | 226.5 → 25.4 ms | 88.8%                           | 10 → 10               |
| Repeated resources, serial discovery: no cache → request dedupe | TTFB                 | 225.0 → 67.8 ms | 69.9%                           | 10 → 3                |
| Repeated resources, already parallel: no cache → request dedupe | Stream completion    | 25.3 → 24.3 ms  | 4.2%; small, overlapping ranges | 10 → 3                |
| Three parallel fetches: cold data cache → primed hit            | TTFB                 | 24.1 → 1.3 ms   | 94.6%; hits only                | 3 → 0                 |

The opaque local shape completes in 15 parent invocations (including the final
successful invocation), not 50. Stable inline creation completes in 11, and
avoids 140 of 150 fetches. These no-boundary counters were constant across all
21 measured samples. With individual boundaries the medians are 6 → 2
invocations and 60 → 10 fetches; their invocation ranges are 6–7 → 2–3 and
fetch ranges 60–70 → 10 as independent boundaries settle in different waves.

Other no-boundary controls:

| Shape                                           | Median TTFB | Parent invocations | Backend calls |
| ----------------------------------------------- | ----------- | ------------------ | ------------- |
| Parent-local `useMemo`                          | 324.2 ms    | 15                 | 150           |
| Parent-local creation with request loader cache | 25.1 ms     | 11                 | 10            |
| Promises prepared once in the request handler   | 24.3 ms     | 11                 | 10            |
| Three independent same-body `use()` calls       | 22.9 ms     | 2                  | 3             |
| Three genuinely dependent `use()` calls         | 67.9 ms     | 4                  | 3             |

These application-pattern changes exceed 20% **for these data-bound fixtures**,
but are not gains introduced by changes to Octane. The three round-median
improvements were 92.1–92.6% for blocked
local → inline, 77.9–79.0% for per-card completion, and 64.7–66.3% for serial →
parallel. In contrast, small shell/cache differences overlap observed timing
ranges and do not support a general 20% TTFB claim. In the per-card local →
inline comparison, TTFB itself was only 2.0 → 1.8 ms; the substantial gain was
in data arrival/completion. A real adapter that emits a head prefix early may
similarly show the gain only in later content.

The zero-delay sensitivity run also passed all 30 cases at 21 samples/case.
Serial → parallel TTFB shrank to 0.49 → 0.45 ms: the large data-round win
disappeared without backend waiting. Opaque local → inline still reduced
TTFB from 4.19 → 1.07 ms and calls from 150 → 10, demonstrating residual
duplicate-work overhead without attributing the 20 ms results to CPU.

Local raw artifacts, generated by the commands below, are
`benchmarks/results/cloudflare-fetch-patterns-20ms-final.json` and
`benchmarks/results/cloudflare-fetch-patterns-0ms.json`. These generated files
are ignored, not published with the source. The separate runtime comparison
has a [checked-in summary](core-retry-results.json).

## Interpretation and controls

- A **data-blocked root** cannot emit a body byte until its data is ready. Its
  data improvements therefore show up directly in TTFB.
- A **streaming shell** emits pending content immediately. Reducing backend
  work improves first resolved data and stream completion, not necessarily
  first byte. Sub-millisecond shell differences are not the headline result.
- A **boundary per card** lets child-local fetches start together. With only
  one outer boundary around the dynamic card loop, suspension of the first
  child prevents discovery of later child-local fetches. Stable prestarted
  promises avoid that waterfall without changing the boundary layout.
- Three independent same-body `use(load(id))` calls already overlap through
  the compiler. They are a control for explicit `Promise.all`, not an additional
  optimization opportunity. Keys derived from preceding responses must remain
  sequential; the dependent control verifies one active backend call at a time.
- Deduplicating ten already-parallel requests for three resources reduces
  backend calls from ten to three, but does not remove a data round. Its large
  latency benefit should disappear in this uncongested backend. With serial discovery,
  deduplication removes seven data rounds and can also reduce latency.
- The warm data-cache case intentionally removes backend I/O. It is a hit-only
  scenario, not an estimated production average or a renderer CPU improvement.

Parent invocation counts include the final successful invocation and do not
count every descendant render. They are not CPU measurements. All timings are
request wall time, including backend waits and local dispatch overhead.

## Cache scope and invalidation

[data.ts](data.ts) implements two benchmark-only policies:

1. A new `Map<resource, Promise<string>>` for every request. It is shared by that
   request's components/replays, then discarded. Different requests never
   share in-flight fetch promises.
2. A bounded, 64-entry, 60-second data cache for the warm-cache experiment. It
   stores only materialized strings, keyed by tenant, resource, and delay. A
   new resolved promise wraps a hit within each request. Failed loads are not
   inserted. The harness explicitly clears or primes it before each sample.

This is not a reusable production cache implementation. A real app needs keys
that capture authorization and every response-varying input, appropriate
freshness/invalidation, and an explicit storage policy. Keep request-bound I/O
objects out of cross-request caches; Cloudflare documents the
[cross-request I/O restriction](https://developers.cloudflare.com/workers/observability/errors/#cannot-perform-io-on-behalf-of-a-different-request).
This test does not benchmark `caches.default`, KV, or their hit rates; the
[Cloudflare Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/#background)
also has data-center-local semantics that this in-memory experiment does not
model.

## Reproduce

From the repository root with its locked dependencies installed:

```sh
BENCH_JSON=benchmarks/results/cloudflare-fetch-patterns-20ms-final.json \
  node benchmarks/ssr-workerd/fetch-patterns/run.mjs 7

# Short focused run; CASES selects case-name substrings.
CASES=per-card BENCH_ROUNDS=1 \
  node benchmarks/ssr-workerd/fetch-patterns/run.mjs 3

# Change only backend delay; this still includes actual fetch/stream overhead.
BENCH_DELAY_MS=0 BENCH_JSON=benchmarks/results/cloudflare-fetch-patterns-0ms.json \
  node benchmarks/ssr-workerd/fetch-patterns/run.mjs 7

pnpm exec tsrx-tsc --noEmit -p benchmarks/ssr-workerd/fetch-patterns/tsconfig.json
```

The runner production-builds the fixtures once, warms each case twice, and
measures seven samples per case in each of three rounds (21 samples per case,
30 cases). Case order reverses on alternating rounds; comparisons share the
same warm workerd process. Cache clearing/priming happens outside the timed
request. The clock starts **before dispatch**, so request-handler preparation
is included, not hidden in warmup. Startup and build time are excluded.

The Node client records the first nonempty body chunk, first chunk containing
resolved article data, and stream end using its monotonic clock. Semantic
decoding and verification run after the timing interval. Requests use
`accept-encoding: identity`. Body-first-byte timing is a local TTFB proxy, not
DNS/TLS/network TTFB from a browser.

Every measured response must contain the complete expected resource list after
decoding Octane's streaming protocol. Single-boundary output must preserve list
order; independent per-card payloads must contain each card ID exactly once,
with the right label, regardless of wire arrival order. Shell cases at 20 ms
must emit a pending chunk before any resolved article. The harness also
asserts successful responses, no render/backend errors, expected unique fetch
counts, and serial/parallel overlap. It drains even unused recreated fetches
before the next sample so they cannot contaminate later requests. Separate
concurrent Alice/Bob requests and subsequent cache hits verify tenant isolation
through the actual response stream.

Raw JSON contains every sample, round, median/min/max/mean/p95, invocation and
fetch counts, environment, source commit, and fixture SHA-256 hashes. Generated
JSON and bundles live in ignored benchmark output directories.

## Validation scope

The recorded measurements compile against the current repository's Octane
source and locked compiler parser, and execute the production bundle in
workerd. The fixture's focused `tsrx-tsc` check and Prettier check also passed
using cached TSRX tooling 0.3.120 (TypeScript 5.9.3, Prettier 3.9.6); locked
0.3.126 validation plugins were unavailable, so these are supplementary checks,
not a claim of exact-lock full-repository validation. These baseline
application-pattern comparisons did not change the runtime or adapter.
The separate runtime patch and its validation are described in
[CORE-RESULTS.md](CORE-RESULTS.md).
