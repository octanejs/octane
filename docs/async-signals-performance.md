# Async signals: performance evidence

This note separates three questions: what the browser downloads, what the server
does, and which behavior the measurements actually exercise. A smaller entry
chunk, a passing browser test, and faster application interaction are not
interchangeable results.

The latest measurements here apply to runtime checkpoint `61e51dd8b`.
Earlier experiments are labeled historical and must not be treated as current
bundle sizes or added together.

## Latest renderer-free binding comparison

The [behavior-only benchmark](../benchmarks/conversation-streaming/behavior-only/README.md)
compares the same fixed native button, icon spans, SVG, state source, events,
streamed results, and cleanup. The manual variant updates properties through a
handwritten callback; the authored variant uses the compiler-generated
`adoptBindings` projector.

Both use Vite 8.1.5 / Rolldown 1.1.5, Node 24.21.0, and source-built TSRX core
0.1.71/runtime 0.1.7. External JavaScript sizes compress each physical file once.
Inline capture is separate; its row includes the fixture's script tag.

| Delivery | Manual | Authored | Difference |
| --- | ---: | ---: | ---: |
| Initial JavaScript, raw bytes | 65,563 | 68,947 | +3,384 |
| Initial JavaScript, gzip-9 bytes | 19,983 | 21,165 | +1,182 |
| Initial JavaScript, Brotli-11 bytes | 18,077 | 19,079 | +1,002 |
| Later optional JavaScript, gzip-9 bytes | 4,090 | 4,090 | 0 |
| Inline capture, raw bytes | 811 | 811 | 0 |
| Inline capture, gzip-9 bytes | 457 | 457 | 0 |

**The authored binding is not a bundle-size win for one small view.** Its reusable
validation, subscription, and cleanup machinery costs more than this small manual
callback. The earlier unused-adoption control was byte-identical to its own
baseline, so this is an opt-in cost for that workload.

No renderer module resolves in either browser graph, including modules that a
bundler might otherwise tree-shake away. The optional query implementation stays
outside initial delivery. Neither statement means the live signal/receiver
support is free.

The final server-error correction at `61e51dd8b` leaves every measured client
chunk and the inline capture byte-identical to parent `f9bd88e8e`. It adds
103 raw / 23 gzip / 51 Brotli bytes to the matched server bundle.

### Behavior and DOM work

WebKit 26.5 passes 12 measured cases per variant plus four warmups per variant
at this checkpoint. Controls cover edits before module loading, equal-value edit
revisions, delayed restore, trusted clicks, native form submission, retained
nodes, and server results adopted without replacement browser loaders.

In the maintained 1,000-publication comparison:

| Publications | Manual attribute mutations | Authored attribute mutations |
| --- | ---: | ---: |
| Unchanged state | 5,000 | 0 |
| Alternating state, equal final DOM | 7,000 | 6,000 |

These are MutationObserver record counts, not render counts or CPU measurements.
Timing includes event dispatch, snapshot creation, and observation overhead.
The alternating WebKit control did not establish a speedup. No paint, INP,
physical-device, or general application-latency improvement follows from this
table.

The lists in this workload keep their historical server HTML while live outputs
consume subsequent result waves. It does not measure renderer-free list
reconciliation, dynamic component rendering, or fetched-navigation placement.

## What the packaging changes achieved

The following are **historical matched experiments**, each with its own baseline
and complete workload. They explain why the boundaries changed. Their deltas
overlap and are not additive.

| Change | Matched observation | Tradeoff |
| --- | --- | --- |
| Separate server query observation and island-event capture from control-only startup | Eager behavior: 28,445 → 26,477 gzip bytes | Some code changed chunks; the server adapter added a small wrapper |
| Remove query construction from query-free owners | Receipt startup: 25,269 → 20,573 gzip bytes | Eventual delivery saved only 1,005 bytes; most startup savings defer real query work |
| Select a results-only receiver when the host owns placement | Receipt startup: 20,573 → 19,370 gzip bytes; eventual: 24,663 → 23,460 | The full receiver control grew 117 gzip bytes |
| Move unchanged class normalization into a dependency-free leaf | Split-renderer fixture eager: 4,718 → 2,478 gzip bytes | Eventual: 54,084 → 53,994; most style machinery remains available with the later renderer |

Each comparison retains equivalent visible behavior. The class-helper change
does not remove style functionality, and query-free startup does not remove
the optional consumer's queries. See
[the runtime experiments](./async-signals-runtime-experiments.md) for retained
and rejected designs.

### Packaging boundary follow-up (2026-09-12)

This comparison uses exact baseline `9661ee423` and the same compiler,
dependencies, fixture, and compression settings. It separates server query
observation from client requests and native-control capture from island intent.

| Physical delivery | Before raw | After raw | Before gzip-9 | After gzip-9 |
| --- | ---: | ---: | ---: | ---: |
| Eager behavior entry | 17,720 | 18,297 | 6,093 | 6,326 |
| Shared signal runtime and fixture state | 74,579 | 67,482 | 22,352 | 20,151 |
| Total eager, two files | 92,299 | 85,779 | 28,445 | 26,477 |
| Optional controller, outside eager total | 162 | 167 | 151 | 155 |

The whole eager graph saves 1,968 gzip bytes, not the shared chunk's reduction
alone. The inline capture is unchanged. The server fixture grows 120 gzip bytes.
This is a byte comparison, not a browser-speed measurement.

## Server work: improvements and remaining overhead

### Historical baseline comparison

The unchanged `benchmarks/streaming-ssr` fixture compared base `2789eab27`
with implementation `044050f57` using production Vite 8.1.5 builds, esbuild
0.28.1, source-built TSRX, Node 24.21.0, Darwin 25.6.0, and Apple M5 Max.

Four fresh processes ran A–B–B–A, each with five warmups and 150 timed renders
per scenario. All 24 correctness gates passed. The score is the runner's
selected late-window mean; these ranges are two per-process observations, not
confidence intervals.

| Stream completion | Baseline score range, ms | Candidate score range, ms | Midpoint change |
| --- | ---: | ---: | ---: |
| 10 cards | 0.191–0.193 | 0.190–0.205 | Overlap; inconclusive |
| 100 cards | 1.077–1.134 | 1.154–1.259 | +9.2% |
| 800 cards | 8.630–9.031 | 9.563–9.637 | +8.7% |
| 50 cards in reverse waves | 1.776–1.801 | 2.018–2.044 | +13.6% |

The 800-card shell increased from 1.769–1.830 to 2.218–2.227 ms, an observed
23.5% midpoint change. The fixture did not declare queries, but opaque member
text still enabled signal ownership. It is therefore not a proven
signal-capability-off control.

Profiles identified owner lookup and structural-path serialization among
material costs. They did not attribute the whole difference or establish a safe
small fix. Removing handle recognition would change supported behavior.
These observations remain a reason to measure common SSR paths, not a claim
that current code has the same precise overhead.

### Shared empty list-key storage

A narrower historical experiment replaced repeated empty list-key arrays with
one private readonly empty array. Keyed paths still extend by copying; identity,
request ownership, and save/restore semantics are unchanged.

In otherwise matched A–B–B–A builds, the 800-card completion score changed from
9.718–10.048 to 9.537–9.576 ms, an observed 3.3% midpoint reduction. Smaller
and timer-dominated cases overlapped or varied. The server bundle grew one
default-gzip byte, and client delivery did not change.

This removed an allocation site, not a measured number of heap bytes. It did
not establish an overall conversation-latency improvement.

### Avoiding duplicate requests is a correctness result

The [conversation benchmark](../benchmarks/conversation-streaming/README.md)
exposed a query that resumed after authorization outside the renderer observer.
Its dependent result streams were absent from the original response, so browser
activation started two extra requests.

Retaining the observer across the pending query description made the complete
flow use one server request rather than three, with all result values present.
The incomplete response is not an equivalent faster baseline. No before/after
latency claim is made for this repair.

## Browser observations and limits

The latest binding check above is Playwright WebKit, not installed Safari.
Earlier, separately recorded builds passed desktop Safari 26.6.2 keyboard
controls and iOS Simulator Safari 26.5 initial-conversation flows. Those runs
do not qualify the latest authored-binding implementation on iOS.

The authored-binding simulator check stopped before reaching the authored path:
native text entry failed in the unchanged manual control. That is missing
coverage, not a demonstrated binding defect. OS IME, physical-device
responsiveness, and native persisted BFCache remain unverified.

A separate historical open-stream check found that a module entry waited for
HTML EOF; a nonce-bearing classic `import()` launcher ran before EOF.
Another same-origin recovery observation followed an aborted module request,
but lacked the failed response's complete headers and resource trace.
Neither proves a general Safari loader defect. Public hypotheses and the checks
needed to distinguish them are in [the Safari investigation](./safari-esm-investigation.md).

## Reproducing and interpreting results

Start with the maintained runners, not another machine's temporary output paths:

```sh
node benchmarks/bench.mjs --quick conversation-streaming
node benchmarks/conversation-streaming/behavior-only/build.mjs --composer-receipts --bundler=vite --projection=manual
node benchmarks/conversation-streaming/behavior-only/build.mjs --composer-receipts --bundler=vite --projection=authored
node benchmarks/scoped-signals/run-async-retention.mjs --cycles=1000
node benchmarks/scoped-signals/run-async-retention.mjs --api=derived --cycles=1000
```

The benchmark READMEs document browser execution, output selection, and
`--build-dir` reuse. Compare identical fixtures, toolchains, options, and
complete results; retain source/output hashes, raw samples, and correctness
controls. Run timing without overlapping builds or tests.

The September 14 local build/browser reports identify `61e51dd8b` and the
manual/authored variants. They are local evidence, not downloadable CI artifacts.
Some earlier temporary timing artifacts are no longer available, so the historical
tables cannot be freshly audited from those raw samples. Maintained runners make
new measurements reproducible; they do not recreate an old machine run.

Report costs separately:

- Inline HTML scripts and serialized data, critical CSS, initial JavaScript,
  automatic later loading, and interaction-triggered loading.
- Unique compressed emitted files versus actual network transfer, cache hits,
  repeated requests, and stream framing.
- Server work versus browser work; DOM readiness versus paint or INP.
- Isolated export bundles versus complete split application graphs. Export
  bundles overlap and cannot be summed as page weight.

The RFC's broader performance acceptance remains open: precise feature-off shared
cost, large repeated SSR work, fetched-navigation timing, concurrent throughput,
allocations, peak memory, and native mobile interaction. Moving work to another
phase is not removing it.
