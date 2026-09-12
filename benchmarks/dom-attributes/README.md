# Static attributes and metadata updates

The production Chromium fixture updates 256 keyed links with dynamic `title`,
`href`, numeric `data-n`, SVG `cx`, and the `strokeWidth` alias. It verifies
the actual values and retained link identity on changed, unchanged, and restored
updates. A separate metadata case renders a title and description, repeats 128
unchanged renders, repairs externally changed head values, then changes and
unmounts them.

```sh
BENCH_SOURCE_ROOT=/absolute/frozen/source BENCH_JSON=/tmp/attrs-baseline.json \
  node benchmarks/dom-attributes/run.mjs
BENCH_JSON=/tmp/attrs-candidate.json BENCH_EXPECT_SPECIALIZED=1 \
  node benchmarks/dom-attributes/run.mjs
node benchmarks/bench.mjs --ratios dom-attributes
```

One instrumented bundle counts entry into the generic attribute writer. Native
head writes are observed separately. Timing uses a second, untouched minified
bundle, five warmup rounds, and 15 samples of 100 full updates. The browser is
closed in `finally`. Counts describe routing work and native writes, not heap
allocation, layout, or application performance. The same fixture and compiler
options must be used for both source roots.

Frozen `58da3448b` versus the candidate on Node 26.4.0 / Chromium 149:

| Work | Baseline | Candidate |
| --- | ---: | ---: |
| Generic attribute writer calls per changed update | 1,280 | 0 |
| Generic writer calls per unchanged update | 0 | 0 |
| Generic writer calls per restored update | 1,280 | 0 |
| Head attribute writes across 128 stable renders | 384 | 0 |

The compiler selects simple writers only after excluding custom hosts,
namespaces, property setters, boolean/enumerated/numeric attributes, and other
special names. It resolves ordinary aliases once. Native URL sinks keep the
shared sanitizer and exact empty-resource URL behavior; data attributes retain
their boolean stringification. Development compilation keeps the diagnostic
route. Every writer retains hydration admission, rollback snapshots, and
post-success binding-cache publication.

The head optimization deliberately compares **live** normalized values for common
metadata attributes. It does not retain user objects or suppress their coercion.
It exchanges redundant native writes for live attribute reads and retains the
existing `textContent` comparison: removing live checks would stop repairing
external edits. Uncommon metadata names retain the full writer. This is the
contract-preserving disposition of the audit's proposed head cache, rather than
a claim that all head reads are eliminated.

The final pair has identical fixture and entry hashes. The complete minified
fixture bundle grows from 165,755 to 167,873 bytes; gzip grows from 53,771 to
54,375 bytes. This includes the PR's template, spread, and event changes, so the
total delta cannot be attributed to the attribute helpers alone. These final
runs overlapped core validation; their timing samples are not used for a latency
claim. The regression guards use only the deterministic routing/write counts.
