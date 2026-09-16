# Repeated server component styles

The compiler injects a component's scoped CSS on every server render of that
component. A stylesheet already present with identical CSS and nonce now keeps
its existing record and replay generation. Changed CSS or nonce still replaces
the entry in its first insertion position.

```sh
node benchmarks/bench.mjs --quick --ratios runtime-style-dedup
SSR_SOURCE_ROOT=/path/to/frozen/source node benchmarks/runtime-style-dedup/run.mjs
SSR_BASELINE_ROOT=/path/to/frozen/source node benchmarks/runtime-style-dedup/run.mjs
```

`BENCH_JSON` saves the normal benchmark schema. The optional baseline root enables
paired timing: 40 warmup renders, then 31 samples of 16 renders, alternating
baseline/candidate order. Timed renders include HTML and CSS byte lengths. Full
output equality is checked outside timing. All builds use this checkout's
compiler and fixture with the selected server source.

## Deterministic work

Baseline: `733c98d57b76fcfbc8f1272cc1e202582f4bedfd`. The benchmark builds a clean
production server bundle and an observed twin. The latter counts evaluated style
record construction sites and nonempty replay Map copies; this is source work,
not V8 heap allocation sampling. Every observed response must match the clean
response's complete HTML and CSS.

| Scenario | Style records, before → after | Replay copies | Copied entries |
| --- | ---: | ---: | ---: |
| 128 identical styles | 128 → 1 | 127 → 1 | 127 → 1 |
| 128 compiled scoped styles | 128 → 1 | 127 → 1 | 127 → 1 |
| 32 established styles, then 128 identical styles | 160 → 33 | 128 → 2 | 4,223 → 65 |
| 128 changed CSS values | 128 → 128 | 127 → 127 | 127 → 127 |
| 128 changed nonces | 128 → 128 | 127 → 127 | 127 → 127 |
| 128 unique styles | 128 → 128 | 127 → 127 | 8,128 → 8,128 |
| 128 unstyled components | 0 → 0 | 0 → 0 | 0 → 0 |

Single-style controls keep one record; a single style after 32 established
styles keeps 33 records and one 32-entry snapshot. Each request begins fresh.
The fixture checks visible row text, complete output, stylesheet insertion
order, final CSS and final nonce. The changed/unique cases preserve the work
whose output requires a new generation.

## Timing and size

Recorded environment: Node 26.4.0, V8 14.6.202.34-node.21, macOS arm64.
In the first alternating-order run, the populated repeated-style workload's
median fell from 0.2830 to 0.0928 ms per response. Its sample ranges did not
overlap (baseline 0.2478–0.3562 ms, candidate 0.0788–0.1262 ms).
A second fresh-process run of the final formatted source measured 0.3276 →
0.1089 ms, again with non-overlapping ranges (0.2651–0.4354 versus
0.0886–0.1740 ms). Both runs show about 67% less time for this workload.
This is a focused repeated-style improvement, not a general SSR throughput claim.

Unpopulated repeated styles measured 0.0911 → 0.0867 ms and compiled repeated
styles 0.0884 → 0.0798 ms; their distributions overlap. Empty, changed CSS,
changed nonce and unique-style controls showed no established improvement. In
the second run, changed/unique/nonce medians increased 3–6%, with overlapping
distributions; the first run's corresponding medians were nearly unchanged.
The extra lookup is a real cost on those paths even though these measurements
do not establish a latency regression.

The paired broad server/fixture bundles measured 122,790 → 122,853 minified
bytes and 40,935 → 40,938 gzip bytes. This is not a minimal application entry.
[Recorded evidence](./measurements.json) includes all samples, source and bundle
hashes, fixture hash, complete-output hashes and work counts.

## Correctness

The `ssr-control`, `ssr-render-phase-state`, `ssr-stream-state-regressions` and
`streaming-ssr` suites pass 238 tests across development and production compiler
projects. The new cases preserve last-writer CSS and nonce behavior in static
and hydratable output, and restore changed styles across repeated render-phase
retries and nested requests.

Both negative controls failed as intended in both compiler modes: ignoring the
nonce when deciding to reuse a style kept an obsolete nonce (four failures);
skipping invalidation for a changed write restored obsolete red CSS instead of
the accepted green stylesheet after a retry (two failures). The final source
was restored byte-for-byte to the measured candidate.

All five deterministic ratio guards pass for the candidate and fail for the
frozen baseline. The local install lacks unrelated website/MDX dependencies,
so tests used an untracked config containing the root config's exact two Octane
projects, including their plugins, setup and exclusions.

## Contract and lifetime

Equality checks compare the stored CSS and nonce directly, without coercion.
No cache, object shape, request lifetime or output order changes. The existing
collector still owns all records and immutable replay snapshots. An unchanged
style reuses that generation; a changed write still invalidates it before
replacement. Retry restoration continues to invalidate its live collector.

This adds one Map lookup to every style write. Unique and changing styles still
pay their existing construction/snapshot costs. Dynamic CSS with expensive
string comparisons, other JavaScript engines and concurrent request throughput
were not measured.
