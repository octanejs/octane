# Async signals: performance evidence

This note separates three questions: what the browser downloads, what the server
does, and which behavior the measurements actually exercise. A smaller entry
chunk, a passing browser test, and faster application interaction are not
interchangeable results.

Each section identifies its measured source or historical checkpoint. Results from different checkpoints must not be treated as current bundle sizes or added together.

## Parallel-start and demand-ownership candidate

Matched minified esbuild closures compare upstream `733c98d57` with the parallel-start candidate based on `4cd85fbcb` plus the resolved upstream merge, lightweight retry-ancestry repair, and exact-owner control retirement. The measured renderer SHA-256 is `fb5e438ee14d78fe26c585b37d766da8c06d5c625ec262b24fc7aa88ff76dbc4`; the control implementation is `97c33f57a4ebafd35006125e7f11718b8e663acd5b0290d100481443304a019f`. No loaded source changed during measurement. Both use the same installed toolchain and production flags.

| Complete dependency closure | Upstream gzip bytes | Candidate gzip bytes |
| --- | ---: | ---: |
| Ordinary `createRoot` | 53,285 | 58,405 |
| Ordinary `renderToString` | 14,906 | 17,654 |
| Scalar authored bindings | Export unavailable | 3,653 |
| Structural authored bindings | Export unavailable | 8,286 |
| Optional control capability | Not measured | 3,221 |
| Optional whole-style capability | Not measured | 2,216 |
| Scalar bindings with controls and whole styles | Not measured | 7,941 |
| Scoped signal engine | Not measured | 9,543 |
| Native client signals | Not measured | 10,933 |
| Native server signals | Not measured | 10,845 |
| Compiled plain-module signals | Not measured | 15,155 |
| Full streamed-signals bootstrap | Not measured | 18,545 |
| Results-only bootstrap | Not measured | 16,561 |

The ordinary client adds 5,120 gzip bytes and the ordinary server adds 2,748 versus upstream. These measure the entire RFC branch, not just the latest fix. Neither ordinary entry retains the optional scoped graph. Scalar and structural binding entries exclude the optional control/style capabilities and retain their published `f3eccc2fc` sizes. The fifteen available baseline/candidate closures pass boundary and export-load checks; two baseline binding exports are unavailable. Complete closures overlap: they cannot be added together or read as an application's startup increment. The runner labels these source-qualified bundle measurements preliminary, not application-budget acceptance.

The matched Chromium mount gate records 34,090 compiled calls versus upstream's 34,088, below the existing 35,000 limit; the previously published branch recorded 50,112. All twelve effect-cleanup gates pass, with compiled counts equal to upstream and JSX counts one call higher. These are work counts, not wall-clock speedups.

The final rich streaming fixture emits 35,086 gzip bytes for its renderer-free authored entry versus 100,459 for the renderer-backed entry. Both deliver an additional 457 gzip bytes of inline capture and load a 92-byte interaction chunk only upon map activation. These complete fixture entries include their signal/query engine, transport, view, and driver; they are not isolated framework overhead. Chromium and Playwright WebKit produce matching assets and pass 24 measured flows plus eight warmups, including page teardown. Neither those passes nor the byte difference establishes application startup cost, paint, input latency, or physical-device performance.

The no-signal 800-card diagnostic retains complete output while eliminating 1,601 speculative signal owners and 3,200 serialized signal-identity paths. Existing structural frame metadata still exists. Matched SSR timing and browser qualification are separate from this allocation diagnostic.

### Matched SSR timing

Four fresh production-build processes ran published `f3eccc2fc` and the candidate in A–B–B–A order, with five warmups and thirty timed renders per scenario. All six output gates passed in each process. Node 24.21.0 on Darwin arm64, TSRX core/runtime 0.2.0, OXC 0.13.0, Vite 8.1.5, esbuild 0.28.1, fixture inputs, and the dependency lock were held constant. Each variant's emitted entry hash remained identical between its two runs.

| Stream completion | Published score range, ms | Candidate score range, ms |
| --- | ---: | ---: |
| 10 cards | 0.160–0.299 | 0.177–0.297 |
| 100 cards | 1.342–1.438 | 1.275–1.421 |
| 800 cards | 9.763–10.216 | 9.518–10.135 |
| 50 cards in reverse waves | 1.910–1.912 | 1.870–1.915 |

These are ranges of two process scores, not confidence intervals. The 800-card score's reported relative uncertainty is approximately 1.8–2.8%; the smaller cases have substantially more noise. The ranges overlap, so this comparison establishes neither a speedup nor a regression. A separate same-configuration upstream `733c98d57` control records 10.213 ms for 800 cards and 1.865 ms for reverse waves; one control process is not a paired upstream performance claim. All thirty-iteration 800-card variants emit 1,433,920 bytes in two chunks. Shorter runs emit smaller request tokens; the separate allocation diagnostic's smaller byte count is not missing card output.

A fresh six-scenario correctness smoke after the control-retirement repair produces the same server entry SHA-256 (`29bc9b3ae7cae643b4b071ff91bb314340136b0c6bcc0e91daa3e1729de6acde`) as both timed candidate processes. The browser-side repair therefore does not change this measured executable. The smoke's three-iteration timings are not compared with the thirty-iteration measurements.

## Historical renderer-free binding comparison (`61e51dd8b`)

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
