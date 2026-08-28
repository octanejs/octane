# Synthetic app workloads in workerd

Two application-shaped SSR benchmarks complement the smaller
[fetch-patterns](../fetch-patterns/README.md) controls:

| Workload | Invented default shape | Data dependencies |
| --- | --- | --- |
| `workspace` | Six consumed context providers, 48 navigation links, 18 rich tiles, a delayed summary, sibling streaming boundaries | Three independent bootstrap loads; profile → access; then navigation, tiles and summary. Seven unique backend calls. |
| `history` | Six consumed context providers, 40 structured rows with headings, text, code, tags and context labels; six related items; nested per-row author boundaries | Three independent bootstrap loads; record → history → four shared authors; related items run alongside history. Nine unique backend calls. |

[Initial validation and repeated-run results](BASELINE.md) include the observed
noise; those local timings are not an absolute performance gate.

These are original synthetic models of common application work, **not replicas
or calibrated representations of a proprietary application**. Names, content,
counts, schedules and schemas are invented. No private source, traces, endpoint
names, credentials, production payloads or production measurements are inputs.
A separately approved, sanitized workload profile would be needed to establish
representativeness; this suite does not establish it by itself.

The timed path is production-compiled `.tsrx` → `octane/server` → a real
workerd response stream. A second local Worker supplies JSON via a service
binding. No external service is contacted. This is **not** the app-core or
Cloudflare adapter wrapper, a deployed-edge test, a browser/hydration test, a
token-generation benchmark, or a CPU profiler. No framework optimization is
implemented by adding these benchmarks.

## Run

From the repository root, with installed workspace dependencies:

```bash
node --test benchmarks/ssr-workerd/app-workloads/verify.test.mjs
BENCH_ROUNDS=1 node benchmarks/ssr-workerd/app-workloads/run.mjs 1 # smoke
node benchmarks/ssr-workerd/app-workloads/run.mjs 7               # baseline
BENCH_SCALE=4 node benchmarks/ssr-workerd/app-workloads/run.mjs 7 # size control
CASES=history BENCH_DELAY_MS=25 node benchmarks/ssr-workerd/app-workloads/run.mjs 7
```

The package also exposes `bench:app-workloads`, `bench:app-workloads:smoke` and
`test:app-workloads`. This standalone suite is not run by the parent unified
`ssr-workerd` command; the weekly/manual Bench workflow runs its oracle tests
and all-case smoke separately. Results default to the ignored
`benchmarks/results/ssr-workerd-app-workloads.json`; override with `BENCH_JSON`.
Fixture/runtime/lockfile hashes, tool versions, worker raw/gzip bytes, individual
samples and round numbers accompany the aggregates. Keep those inputs identical
when comparing framework revisions. This suite contains no private reference
implementation and makes no cross-framework speed claim.

Each workload has four controls, not four different applications:

- `zero-delay`: real fetch/JSON operations, no artificial timer delay. It is
  still end-to-end wall time, not isolated renderer CPU time.
- `io`: fresh request cache, base delay 15 ms. Summary/related and the fourth
  author use 4× the base delay; the other authors use 1×, 2× and 3×. These are
  controlled timer waits, not production service-latency estimates.
- `io-blocked-root`: identical to `io` except the outer loading-shell boundary
  is absent. The bootstrap now blocks TTFB; descendant boundaries still stream.
  This exposes bootstrap costs that an immediate shell can otherwise hide.
- `warm-data`: clear the bounded data cache, prime the same workload outside
  timing, then measure a request with zero backend calls. Priming is explicit;
  it is not a runtime speedup. The 128-entry, 60-second cache contains completed
  JSON values, keyed by synthetic tenant, resource, scale and delay. Promises
  stay request-local, including warm hits. Errors are not cached.

All modes use stable request-scoped promises. Repeated profile and author
consumers exercise deduplication without introducing the opaque parent-created
promise stress pattern already covered by `fetch-patterns`. `BENCH_SCALE=1..4`
multiplies links, tiles, rows and related items; provider depth and the number of
unique data sources stay fixed. `BENCH_DELAY_MS=0..100` changes the delayed modes.

## Metrics and correctness

Two warmups precede three rounds of seven samples per case by default. Case
order reverses in alternate rounds. All timed samples are retained; medians,
means, spread and p95 are reported. Small deltas within the observed spread are
inconclusive. The first requests and correctness preflights are not cold-start
measurements.

Timing starts before request dispatch and ends at stream EOF. Fetch startup,
JSON parsing, fixture generation and SSR all remain inside that window. The
consumer stores raw bytes and timestamps; it decodes and verifies only after
timing. Requests disable compression to avoid measuring gzip buffering.

- `ttfb`: first nonempty response-body chunk, including the synchronous shell.
- `firstContent`: first chunk containing the primary section's first completed
  tile/row title on the wire; the section can still be partial. A loading
  placeholder does not qualify.
- `total`: stream EOF, accepted only when all expected output is present.
- Wire bytes/chunks, exact proof count, bootstrap attempts, loader calls, cache
  hits and unique backend calls reveal work shifted beyond the first byte.

Untimed backend gates hold **all data** until the consumer receives the shell,
then separately hold **tail data** until primary content arrives. This proves
incremental delivery without a wall-clock threshold. Every measured response
must contain every expected leaf ID and escaped value exactly once, ordered
items within each list, all six correct context values, and tenant-correct data.
The stats gate checks dependency edges, overlapping independent bootstrap loads,
expected backend calls, no errors and complete request draining. Concurrent
tenant tests check cold and warm cache isolation and changed-size cache keys.
Oracle tests deliberately remove, duplicate and corrupt output and dependency
records.

The shared stream decoder exposes boundary payloads for verification; it does
not execute the browser adoption protocol or reconstruct final DOM hierarchy.
Independent boundaries may arrive in any wire order. This suite verifies
payload completeness, not browser placement, paint or interaction readiness.
Diagnostic routes and gate state exist only for this local harness; do not
deploy these Workers as application endpoints.
