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

The deduplication equality checks compare the stored CSS and nonce directly,
without coercion. They introduce no cache, object shape, request lifetime or output order changes. The existing
collector still owns all records and immutable replay snapshots. An unchanged
style reuses that generation; a changed write still invalidates it before
replacement. Retry restoration continues to invalidate its live collector.

This adds one Map lookup to every style write. Unique and changing styles still
pay their existing construction/snapshot costs. Dynamic CSS with expensive
string comparisons, other JavaScript engines and concurrent request throughput
were not measured.

## Captured theme classes

The server also collects registered theme sheets when it renders a class string
captured before the request. Registration retains CSS and the compiler's flat
`$class` dependency chain, with one record per compiled hash. It does not retain
theme proxies, component props, or request collectors. Repeated local declarations
reuse unchanged records. Plain classes take a prefix search; an already-collected
single theme hash takes one collector lookup. Class lists inspect complete HTML
whitespace-delimited tokens and collect missing dependencies before the theme.

The additional workloads cover 128 ordinary classes after theme registration,
128 direct theme classes, 128 captured theme classes, and 128 component-local
theme declarations. Each checks complete HTML/CSS and repeated requests. The
unfixed runtime's captured-class comparison explicitly reads the proxy during
each baseline render, so both sides emit the same CSS. This is a working
control, not a timing comparison against the broken empty-CSS behavior.

Command: `SSR_BASELINE_ROOT=/tmp/octane-1310-baseline BENCH_JSON=/tmp/octane-1310-style-final.json node benchmarks/runtime-style-dedup/run.mjs`.
The baseline archive contains Octane source from `e813fc0e6`; both builds use the
same current compiler, fixture, 40 warmups, and 31 alternating samples of 16 renders.
Node 24.18.0 / V8 13.6.233.17-node.50, macOS x64. Recorded median milliseconds:

| Scenario | Baseline | Candidate |
| --- | ---: | ---: |
| Unstyled components | 0.46503 | 0.46745 |
| Ordinary classes with a registered theme | 0.15210 | 0.17490 |
| Direct theme classes | 0.15405 | 0.15720 |
| Captured classes vs explicit proxy-read control | 0.18878 | 0.21222 |
| Component-local themes | 0.25913 | 0.27599 |

Sample ranges overlap on this shared machine, so these timings do not establish
a general throughput change. The new class lookup is an accepted correctness
cost; no speedup is claimed. Broad server/fixture bundles grow from 176,415 to
177,227 minified bytes and from 57,858 to 58,161 gzip bytes (+303 gzip bytes).
[Full measurements](./captured-theme-measurements.json) retain samples, source
and bundle hashes, semantic output hashes, and deterministic work counts.

Self-review removed per-map weak metadata tracking: the compiler already emits
the complete dependency chain as a string, so registration needs no per-request
object graph. Real request concurrency throughput and other JS engines were not
benchmarked; concurrency, aborts, streaming, hydration, and nonce isolation have
behavioral regression coverage.

## First insertion of an applied theme

`injectStyle` now collects a registered sheet's applied dependencies before its
first insertion. This also covers compiler-generated component preludes, which
can inject a module's sheet before rendering a captured class. The unchanged
CSS/nonce fast path still returns first. New sheets pay a registry lookup when
themes have been registered; applied chains reuse the existing hash arrays and
skip dependencies already in the request. There is no new cache or retained
state, and generated component code is unchanged.

The `same-module-applied-classes` workload renders 128 components whose local
theme applies an imported base. Its captured class entry must collect both
sheets, in base-before-override order. The baseline explicitly reads the theme
proxy before rendering so both versions produce byte-identical HTML and CSS.
This compares against a working control, not the broken missing-CSS output.

Paired measurements against `9b6c3a48e1f196c7097b48d429f6997169556922` use the
same compiler and fixture, 40 warmups, and 31 alternating samples of 16 renders.
Node 24.18.0 / V8 13.6.233.17-node.50, macOS x64. Median milliseconds per response:

| Scenario | Baseline | Candidate |
| --- | ---: | ---: |
| Repeated styles | 0.20932 | 0.20571 |
| Unique styles | 0.96200 | 1.00994 |
| Ordinary classes with registered themes | 0.08629 | 0.10206 |
| Same-module applied classes vs explicit proxy-read control | 0.35621 | 0.36703 |

Every timing range overlaps; these shared-machine results do not establish a
throughput improvement or regression. All 14 existing workloads preserve their
complete output hashes and deterministic work counts, and all five applicable
ratio guards pass. The new workload creates two stylesheet records and one
two-entry replay copy. Broad server/fixture bundles grow from 177,609 to 177,679
minified bytes and from 58,286 to 58,293 gzip bytes (+7 gzip bytes).
[Recorded measurements](./applied-theme-measurements.json) contain the samples,
source/bundle hashes, output hashes, and deterministic work counts.

The regression suite fails 12 cases against the original runtime while its four
no-import controls pass. The candidate passes 670 targeted tests across dev and
prod compilation, covering repeated requests, explicit CSS/nonce preservation,
shared transitive dependencies, streaming, errors/aborts, and hydration. Review
consolidated dependency collection at first stylesheet insertion rather than
adding another compiler emission path. Large dependency graphs, other engines,
and concurrent-request throughput were not benchmarked.

Local tests used a focused Vitest config with the standard Octane plugin,
per-test cleanup, frozen-AST/source-location checks, and one worker. Scoped
typechecking, formatting, and changeset checks passed. The full repository
suite and CI were not run.
