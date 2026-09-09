# Memo wrapper shapes

This Node-only production benchmark measures the creation and named-property
reads of 128 and 1,024 distinct `memo()` wrappers. It runs the client and server
runtime in separate V8 isolates; mixing their accessor identities in one
process would change the hidden classes being measured. A plain nested-function
factory and plain-function read are timing-drift controls. A synthetic data-only
function has the same readable statics but no accessors, isolating the lookup
and descriptor overhead; it is a performance control, not a replacement for
the live `defaultProps` contract. The client uses an
optional comparator on every eighth wrapper; the server has no comparator
argument. Multiple wrapper shapes matter here: `memo-wall` exercises memo
bailouts but does not make many distinct wrappers at one property-read site.

Before each measurement the harness verifies the public `type`, `displayName`,
`defaultProps`, `__memo`, optional `__compare`, direct invocation, and enumerable
keys. It copies all non-enumerable statics into a HOC and checks that the copy
does not gain memo behavior, while its defaults stay live. It also checks both
directions of default-prop updates and a writable display name. Each sample's
result has a stable semantic hash; V8 `%HasFastProperties` records the untimed
fast-property count on the retained read fixtures, without making hidden class
details a correctness gate. Five warmups precede the timed samples, and scenario
order alternates. Results are microseconds per wrapper created or read.

```bash
node benchmarks/memo-wrapper-shapes/run.mjs 7
BENCH_DIST_DIR=/absolute/frozen/dist BENCH_JSON=/tmp/memo-wrapper-baseline.json \
  node benchmarks/memo-wrapper-shapes/run.mjs 13
BENCH_JSON=/tmp/memo-wrapper-candidate.json \
  node benchmarks/memo-wrapper-shapes/run.mjs 13
```

For paired comparisons, use `BENCH_DIST_DIR` for an already built production
distribution, or set both `BENCH_CLIENT_RUNTIME_URL` and
`BENCH_SERVER_RUNTIME_URL` to absolute `file:` URLs. If no override is set, the
harness builds the current Octane package. Interleave frozen baseline and
candidate runs (for example, B–C–C–B), compare all semantic hashes, and compare
memo creation/read against both the data-only and plain-function controls. Keep Node,
dependencies, sample count, and process isolation the same on both heads.

The shape count is a V8 diagnostic, not an application throughput claim. The
timing does not measure DOM rendering, SSR page throughput, hydration, GC pause
distribution, or bundle size. The source changes may move work from creation
to metadata reads, so compare both operations and the plain controls before
claiming a speedup.
