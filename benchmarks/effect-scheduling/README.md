# Effects and scheduling work guards

Issue [#981](https://github.com/octanejs/octane/issues/981) identifies scheduler
wave bookkeeping, effect/ref ancestry sorting, and effect dispatch overhead.
This suite covers the first two; the existing
[`effectful-list/dispatch.mjs`](../effectful-list/dispatch.mjs) checks dispatch
arguments and stale-entry membership.

```sh
node benchmarks/bench.mjs effect-scheduling --ratios
node benchmarks/effect-scheduling/wave.mjs 8a45222ab
node benchmarks/effect-postorder/refs.mjs 8a45222ab
node benchmarks/effect-postorder/run.mjs 8a45222ab
node benchmarks/effectful-list/dispatch.mjs 8a45222ab
```

## Scheduler waves

`wave.mjs` extracts the actual runtime sort, strips TypeScript, and compares it
with a frozen Git revision. It measures Map/Set construction and parent reads
separately from uninstrumented helper timings. Stable shallow-first ordering,
repeated epochs, changed ancestry, and lightweight proxy shapes are semantic
controls. The fixtures include a reversed 400-node chain, 1,000 siblings,
1,000 updates beneath 40 unqueued ancestors, mixed roots, and a chain containing
lightweight ancestry proxies.

At baseline `8a45222ab`, every multi-block sort constructs one Set and one Map.
The candidate constructs neither. It also removes the temporary path array and
per-sort comparator closure. Parent reads in the counted pass:

| Shape | Baseline | Candidate |
| --- | ---: | ---: |
| Reversed chain | 400 | 800 |
| Siblings | 2,000 | 2,002 |
| Shared unqueued ancestors | 42,000 | 2,082 |
| Mixed roots/depths | 734 | 1,370 |
| Shared chain with lite proxies | 42,000 | 2,082 |

The tradeoff is a second walk over each uncached path. Cache state uses the
existing numeric scheduler fields only during sorting; positive drain IDs
restore their loop-guard meaning before a block executes. Each new drain
invalidates old depths. No tree pointers, extra Block fields, or collections
are retained. Lite proxies receive no fields and still contribute to depth;
shared consecutive lite proxies can be traversed repeatedly.

The single-update path remains outside the sort. These are executed source-work
counts, not V8 heap-allocation measurements or application-latency claims.
The helper timings isolate sorting and are not a substitute for a full render.

## Ref attachment and effect ordering

The paired ref probe observes native sort calls and independently verifies
callback order. A single ref and 1,000 sibling refs each go from one sort to
zero. Mixed ancestry and deep disjoint branches retain one sort. A named
comparator removes the per-drain closure on that fallback.

Effect ordering retains its ancestry fallback: descendants precede their
queued ancestors, while disjoint branches retain enqueue order even at unequal
depths. The existing direct-parent/sibling shortcuts already cover the ordinary
effectful-list fixture. Global depth fields would impose a cost on unrelated
blocks; no such fields are introduced.

The new 128-leaf deep-disjoint comparator fixture and existing chain, sibling,
and mixed fixtures validate the retained fallback. Their parent-read counts
are unchanged. See the production lifecycle measurements below for the full
1,000-row workload.

## Coverage and limits

Seventeen deterministic ratio guards cover wave collections/ancestry work and
ref sort calls, including entries without an owning block. Behavioral tests protect ancestor removal, deep render-phase
convergence, sibling notification order, failed-root isolation, node identity
through hydration, and nested ref attachment. Deliberate positive depth stamps,
reversed stable ties, and omitted mixed-ref sorting each fail the corresponding
consumer tests in development and production.

Effect dispatch keeps hook-Map membership validation and `apply(null, args)`.
A retained effect-list record can outlive its hook-key ownership; revisions
alone do not establish membership. Callback invocation must preserve the null
receiver, positional dependency arguments, and observable callback/argument
access. The dispatch controls reject missing/replaced slots and stale revisions.
Neither an unchecked indexed lookup nor an unguarded arity switch is adopted.

## Production lifecycle and bundle comparison

A frozen baseline and the final candidate were production-built through both
existing effectful-list dialects and served to Chromium. An A–B–B–A run used
eight warmup and eight measured samples per operation. All 48 lifecycle gates
passed: four runs × two dialects × six operations, checking expected 1,000-row
effect/ref callbacks, cleanups, and DOM shape.

Median milliseconds, in A1 / B1 / B2 / A2 order:

| Dialect | Mount | Dependency update | Remount |
| --- | --- | --- | --- |
| TSRX | 12.0 / 15.2 / 10.1 / 17.3 | 4.21 / 4.03 / 2.70 / 6.77 | 13.2 / 10.3 / 10.4 / 19.7 |
| JSX | 14.2 / 16.5 / 10.4 / 19.2 | 4.98 / 4.50 / 3.04 / 5.20 | 12.5 / 12.5 / 12.5 / 18.3 |

Both the baseline and candidate vary substantially. These results do not
establish an end-to-end latency gain. The deterministic collection/read/sort
reductions above are the supported performance claim.

| Production bundle | Baseline | Candidate | Delta |
| --- | ---: | ---: | ---: |
| TSRX minified JavaScript | 176,968 B | 177,227 B | +259 B |
| TSRX gzip level 9 | 57,005 B | 57,058 B | +53 B |
| JSX minified JavaScript | 178,607 B | 178,866 B | +259 B |
| JSX gzip level 9 | 57,655 B | 57,713 B | +58 B |

TSRX baseline bundle SHA-256:
`8b7676e32df89ab95f8047641396c607d360dfa727ed573dda7025543cda35e1`.
TSRX candidate bundle SHA-256:
`8a8e7c23745caffcb8a8c7b747b1e6181ed845bf27b8b6e01d19c3231e476d4b`.
JSX baseline bundle SHA-256:
`36d911fa761e00aa6f9a3ff2e9208bc1bbc3665f99f97e5a2351cc7c1eff90f2`.
JSX candidate bundle SHA-256:
`14f46cfbcd1ab43b55deb11e226746ac0ccd7926066650c769f4dbdb300328b6`.
Node 26.4.0 on macOS ARM64 was used for the helper probes. Browser timings use
Chromium and do not establish Firefox or WebKit timing behavior. Server effect
bodies do not execute; client hydration behavior is covered separately.
