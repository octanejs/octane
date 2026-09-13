# Async Signals performance follow-up

## Scope and reproducibility

The original checkpoint below is historical. Its temporary raw artifacts
were subsequently removed and are unavailable for fresh verification. The
maintained runners remain available; new runs establish evidence for their own
recorded sources and do not revalidate the earlier comparisons. A fresh retest is
recorded separately at the end of this note.

This checkpoint adds the maintained [conversation-streaming benchmark](../benchmarks/conversation-streaming/README.md):
a public shell and native composer, independently activated body/history regions,
and two private streaming loaders behind one request-local authorization. It uses
the real production compiler, application host, module-server transport, implicit
signals, and direct `value={draft$}`. Authentication is a deterministic fixture,
not a real-account or production-backend check.

The Node suite is registered in `benchmarks/bench.mjs`; browser measurement is
explicit and separate. Every run retains source, fixture, toolchain, runner,
asset hashes, raw samples, and untimed semantic controls. The documented commands
work with an installed workspace toolchain. This local checkpoint instead uses
the previously approved source-built TSRX revision
`3ca1f0379fde7ea39d86e39ae92079c50fd18fc2` (core 0.1.71, runtime 0.1.7), Vite 8.1.5,
esbuild 0.28.1, Node 24.21.0, Darwin 25.6.0, and Apple M5 Max.

At this checkpoint, registry installation was blocked by the security proxy for a TSRX package;
no package pins or lockfile were changed. These results are not frozen-install,
CI, mobile, or production-service certification.

## Correctness work that also removes redundant requests

The new application workload exposed a missing handoff: a query describing its
request could suspend on authorization, then start outside the renderer's query
observer when authorization settled. The original response only carried the
authorization result. Dependent streams could be canceled before their final
values, and activating the body/history started two extra requests.

The fix preserves the exact renderer observer across a pending query description
and re-enters it when that description resumes outside a render. Disposal clears
the captured observer; an active matching renderer supplies its own context.
This uses the existing attempt/owner transport, without a new public API, global
async context, graph-read hook, or forced recomputation.

The same new correctness gate failed before the fix (one result channel rather
than three), then passed with all authorization/body/history frames and every
four-wave value. Hydration now uses the delivered values: one server request
instead of three across the complete browser flow. An incomplete response is
not a valid faster baseline, so there is no before/after latency claim for this
repair.

The first ready SSR snapshot remains historical HTML. Later query yields update
live data; they do not produce replacement HTML on every yield. The browser
checks the initial snapshot while region code is held, then the complete live
value and original-node adoption after activation. Fetched conversation-slot
navigation and cached-to-fresh reconciliation remain separate integration
coverage, not a claimed navigation benchmark here.

## Small measured SSR optimization

SSR previously constructed an empty list-key array on each component entry and
pass reset. List arms already extend it by copying. The implementation now shares
one private readonly empty array; keyed paths, save/restore behavior, serialized
identity, and request ownership are unchanged. It adds no cache or invalidation
policy. Removed source allocation sites are not measured heap/allocation bytes.

The original `streaming-ssr` fixture was built twice from otherwise identical
frozen sources. Five warmups and 150 measured renders per scenario ran in each
fresh process, A–B–B–A, with all six maintained gates and full card/spec/shell
payload checks. The table uses the runner's selected-window mean scores, not
medians; ranges are two-process observations, not confidence intervals.

| Original streaming fixture | Before, ms | After, ms | Interpretation |
| --- | ---: | ---: | --- |
| 800 cards: shell | 2.252–2.324 | 2.203–2.248 | Observed 2.7% midpoint reduction |
| 800 cards: complete | 9.718–10.048 | 9.537–9.576 | Observed 3.3% midpoint reduction |
| 50 cards in ten waves: complete | 2.004–2.062 | 1.993–2.005 | Overlap; inconclusive |
| 100 cards: complete | 1.165–1.175 | 1.160–1.171 | Overlap; inconclusive |
| Deliberate 50 ms delay: complete | 50.779–50.875 | 50.760–50.888 | Timer-dominated; unchanged |

Not every row improves: the delayed case's small shell score moved from
0.148–0.207 to 0.211–0.221 ms. The 10-card and all-fast results are also too noisy
for a general speedup claim. The complete server bundle changes by +6 raw / +1
default-gzip byte; this optimization does not reduce client delivery.

## Application-shaped Node measurement

Both variants include the dependent-query correctness fix. All 14 fixture files,
toolchain fingerprints, and product files other than `runtime.server.ts` match.
Each fresh A–B–B–A process measured 100 responses per scenario. Builds, other
tests, and browser timing did not overlap these measurements; unrelated machine
contention was not independently excluded.

| Complete production-handler response | Before, ms | After, ms |
| --- | ---: | ---: |
| Body first: 20 turns, 10 history rows | 58.153–59.275 | 59.299–59.781 |
| History first: 20 turns, 10 history rows | 58.934–59.260 | 58.950–59.048 |
| Four waves: 200 turns, 60 history rows | 85.130–85.500 | 84.843–85.317 |
| Same four-wave graph without timers | 1.271–1.378 | 1.214–1.322 |

These are selected-window score ranges. The timer-free ranges overlap, and the
body-first result is slightly slower. Large variation in its baseline shell/CPU
scores makes an app-wide improvement or precise regression claim unjustified.
The optimization is retained for the larger SSR result, not described as a
conversation latency improvement.

In the final build, delayed shell scores are 0.745–1.158 ms, first private HTML
roughly 41–42 ms, and the second region roughly 58–60 ms, with the shared 30 ms
auth delay included. The timer-free complete-response p95 is 2.074–2.556 ms.
These are same-process Web Response consumption measurements, not network TTFB,
browser paint, or concurrent service latency. Process CPU includes fixture and
consumer work and is reported separately in the raw results.

The delayed large response carries 158,399 raw bytes in 23 consumed chunks:
one historical 50-turn/15-history-row snapshot plus all four live values for
both regions. The timer-free response can already render revision four as HTML,
so its 237,247 bytes / 22 chunks are not an equivalent wire-size workload.
Both variants validate each actual snapshot against its revision and all 15
result frames (authorization once, body/history four values each). Chunk counts
describe this consumer, not TCP packets.

## WebKit activation and delivery

Two fresh headless WebKit 26.5 processes each ran four untimed causal gates,
five warmups and ten measured samples per scenario: 128 flows, including 80
measured flows. All passed with one auth/server request, no hydration refetch,
preserved original input/rows, correct live values, and no browser errors.
Parent/body/history code remained unevaluated during isolated composer activation.
Both owned servers and browsers were closed and their ports verified inactive.

| DOM observation | Median across the two processes, ms |
| --- | ---: |
| Public shell, all scenarios | 4 |
| Faster private region | 41–42 |
| Slower private region | 58–59 |
| Composer focus to ready | 10–11 |
| Native input to derived DOM | Below the observed clock resolution |
| Next matching rAF, successful-auth scenarios | 12–14 |
| Large body activation to final 200-row DOM | 7 |
| Large history activation to final 60-row DOM | 4 |

These include the configured data delays and observation overhead. Descriptive
p95 ranges are 11–12 ms for composer activation and 14–16 ms for successful-auth
next-rAF observations. At ten samples the maintained p95 is the observed maximum;
it is not a population-tail estimate. DOM presence and rAF do not prove paint,
INP, or real iPhone/Safari performance. A zero input-duration sample means the
clock could not resolve the work, not that it cost nothing. These are repeated
candidate measurements, not a before/after browser speed comparison.

Delivery below is invariant across all 128 flows. The rows are disjoint
completion phases, compressed per physical emitted file. They exclude HTML,
inline bootstrap text, headers, transfer framing, and cache effects.

| Completed physical files | JS / CSS | Raw bytes | Gzip-9 bytes | Brotli-11 bytes |
| --- | --- | ---: | ---: | ---: |
| Before first interaction | 9 / 0 | 353,134 | 113,365 | 98,832 |
| Additional composer activation | 2 / 0 | 17,871 | 6,773 | 6,087 |
| Additional full release | 3 / 0 | 9,206 | 3,526 | 3,100 |
| Total | 14 / 0 | 380,211 | 123,664 | 108,019 |

One parent file (1,306 gzip bytes) was requested during startup but deliberately
held until full release; it is charged to completion only there. These are not
literal network transferred bytes. Thirteen client files exactly match the
typed baseline; the generated bootstrap has different build IDs/minifier names,
equal raw/gzip size, and +6 Brotli bytes. No client optimization is attributed to
sharing an empty server-side array.

## Refreshed core/export size

Two final repeated independent export builds compare audited base `2789eab27`
with the current source, including both follow-up fixes. Source and output hashes
are recorded. Sizes below use gzip level 9; overlapping export closures must not
be added together or substituted for the physical application delivery above.

| Export closure | Base bytes | Current bytes | Added bytes |
| --- | ---: | ---: | ---: |
| Ordinary client root | 50,695 | 53,205 | 2,510 |
| Client hydration root | 66,499 | 69,892 | 3,393 |
| Synchronous SSR | 13,363 | 15,716 | 2,353 |
| Streaming SSR | 17,716 | 23,872 | 6,156 |
| Query engine | 9,669 | 13,914 | 4,245 |

The ordinary client does not retain the full query graph/engine, but shared
support still costs about 5% more gzip than the audited base. Candidate-only
independent hydration, streamed hydration, and signal-facade closures are 5,023,
21,603, and 15,856 gzip bytes respectively; those overlap core and one another.
The observer repair adds 113 gzip bytes to the independently bundled query engine
relative to the previous checkpoint. Server and browser costs remain distinct.

## Final validation

The shared-key optimization was checked against a deliberate leaked-key fault:
the complete existing identity file passed 18 cases before the fault, then
failed four server/client identity assertions in development/production. Restored
source matched the measured hash and passed 290 existing regression cases across
20 development/production project-files, including 1,000-level SSR, keyed
hydration, concurrent owner isolation, abort, and independent activation.
No new Vitest or Storybook interaction tests were added.

Actual source-built TSRX typechecks pass for server/identity, query/RPC, and the
complete authored application fixture. Separate earlier checks cover the
dependent-query repair, including multiple pending strata and retirement before
authorization. The final read-only review found no actionable core/benchmark
issue. Broader previously recorded baseline failures and unavailable CI remain
separate; this focused pass does not assert a globally green repository.

The unified quick runner exposed a macOS `/var` symlink build-root mismatch.
The benchmark now canonicalizes its temporary directory before calling Vite;
this changes build setup only, not the measured product or fixture. Earlier
explicit physical-path measurement artifacts were intact at that checkpoint;
those temporary artifacts have since been removed. The documented
unified quick command now passes all four Node scenarios; a fresh default-path
production build also passes 28 WebKit smoke flows. Those smoke timings are not
used in the tables above. Repository synchronization and scoped formatting pass
using the approved source toolchain, with the out-of-sync-install warning kept
visible; neither is a successful frozen dependency installation.

## Remaining work

The earlier matched baseline investigation still identifies repeated structural
identity work as a larger opportunity. In the unchanged 800-card fixture, two
passes cause 3,202 component/owner entries and 3,200 structural serializations.
Fifty cards across eleven passes cause 1,111 entries and 1,100 serializations.
Pass counts did not increase; existing streaming retries multiply new per-entry
cost. Temporary authored primitive-text controls reduced this cost, but removing
handle recognition or requiring authors to coerce values is not the solution.

Potential next optimizations are a more precise compiler capability decision and
less repeated structural-path construction, with keyed reorder, nested regions,
request isolation, and retirement controls. A frame-object cache is not an
obvious safe fix: frames can be recreated between passes. No such cache or
compiler semantics change is included here.

Automatic bootstrap delivery also deserves a separate bundle-splitting pass;
small interaction-only chunks must not hide eager dependencies. None of these
measurements closes real iOS/Safari input/IME acceptance, paint/INP, native
BFCache, fetched-navigation timing, concurrent throughput, allocation rate, or
peak-memory work. The RFC's broader V5/I6 performance gates remain open.

## Historical local evidence

The checkpoint recorded these artifacts under
`/private/tmp/octane-signal-validation.aX019a`. That temporary directory has since
been removed; these locations are a historical record and cannot currently be
used to inspect the raw samples or hashes:

- `streaming-text-control.vvuT17/` and `streaming-work-counts-mB3nUT/`: earlier
  four-variant causal investigation and separate deterministic counts.
- `ssr-empty-list.R4UxVt/`: final matched ordinary-SSR optimization experiment,
  complete samples, source/fixture hashes, commands, and semantic observations.
- `conversation-typed-base.gqdQj3/node-a1.json` and `node-a2.json`: matched base.
- `conversation-empty-trial.qZjsEJ/node-b1.json` and `node-b2.json`: final candidate.
- `conversation-empty-trial.qZjsEJ/browser-z0etdQ/` and `browser-g4hZ0I/`: final
  two fresh WebKit processes, network/module gates, native interaction and DOM
  timing, phase accounting, and retained reports.
- `conversation-browser-final-review.md`: independently recomputed browser
  timing distributions, phase bytes, no-refetch controls, and final hashes.
- `final-costs-2026-09-12T14-28-08-602Z-*`: two repeated final export/compiled
  builds and unchanged-source provenance.
- `final-ssr-regression.9XmvxB/`: credible full-file red, restored green, and
  exact commands/source hashes.
- `conversation-unified-final-green/`: successful default-temp unified quick
  run after path canonicalization. Its fresh build records the separate final
  browser smoke report under `browser-azgnav/`.

These historical local paths were not distributable CI artifacts. The maintained
benchmark and its commands are the reproducible deliverable.

## Fresh September 12 retest

After correcting pending synchronous projections and asynchronous dependency
activity, the maintained production fixture was rebuilt with the restored
source-built TSRX revision `3ca1f0379fde7ea39d86e39ae92079c50fd18fc2`: core
0.1.71 and runtime 0.1.7. The environment was Node 24.21.0, Vite 8.1.5,
esbuild 0.28.1, Darwin 25.6.0, arm64, Apple M5 Max. This is source-toolchain
evidence, not a frozen workspace installation or CI result.

The build records base commit `212b07e22` plus the then-uncommitted fixes.
The final `computations.ts` SHA-256 is
`0c65178ab8d90437e9e3107792f50b8ff967ae47d53d69fcd3f2fad7707f508e`;
`graph.ts` is
`54ef356184d57dbbd06f8417d899043d001492a16fa7bd9b99d53d884f9cd7c2`.
All recorded product-source hashes were unchanged after the runs.

### Repeated Node measurement

Two fresh processes each ran five warmups and 100 measured responses for each
of four scenarios, with untimed complete-payload checks before and after.
Both runs passed all scenarios plus denied-authorization and pre-auth abort
controls. Builds and other task CPU workloads were idle during timing.
The ranges below are two observed process results, not confidence intervals.

| Complete production-handler response | Selected-window score range, ms | Observed p95 range, ms |
| --- | ---: | ---: |
| Body first | 57.118–59.606 | 61.053–62.811 |
| History first | 58.271–59.595 | 60.309–60.958 |
| Four waves, 200 turns / 60 history rows | 86.779–87.980 | 90.146–91.227 |
| Same graph without timers | 1.853–2.243 | 3.105–3.560 |

These are candidate-only measurements. Repeat variation, especially in the
timer-free and process-CPU samples, is material; this does not establish a
speedup or revalidate the deleted baseline experiment. Process CPU includes
the fixture and same-process consumer. The delayed large response remains
158,399 raw bytes / 23 consumed chunks; the timer-free variant is 237,247 / 22
because it can already render the final revision in its initial HTML.

### Native desktop Safari correctness

Four fresh native Safari 26.6.2 sessions, driven by the installed SafariDriver
on macOS build 25G83, passed body-first, history-first, large-waves, and denied
scenarios against those exact assets. These were untimed causal checks with
authorization and selected authored modules held by a local proxy. A small
diagnostic script recorded native events and browser errors before application
code; the emitted application assets were unchanged.

The checks prove native early typing, Backspace clearing and retyping, repeated
keyboard selection, and preservation of the original focused textarea and its
backward selection through composer-only activation. Post-activation native input
updates the derived value. For successful authorization, three early keyboard
activations in each held body/history region replay to the final selected row,
with original row identity and the complete live payload, including all 200/60
rows at revision four. Each scenario retains one authorization/server request
and no hydration refetch. The denied scenario validates its SSR error arms and
composer; its body/history regions have no keyboard controls and were not
separately activated.

Plain textarea/button controls reproduced two SafariDriver limitations without
Octane: Command+A did not select all, and element/pointer click commands did not
emit a button click. Native Backspace, Shift+Arrow selection, and trusted Enter
activation worked and were used explicitly. This is keyboard activation proof,
not mouse/touch acceptance. Earlier diagnostic failures and both plain controls
are retained. Safari's automatic `/favicon.ico` 404 is recorded separately;
application resource failures and browser errors remained absent. All owned
Safari sessions, driver processes, proxies, and application servers were closed.
These desktop checks do not cover actual iOS Safari, native touch, OS IME,
BFCache, paint/INP, or browser latency. Native iOS results are recorded separately
below.

### Native iOS Safari correctness

Four native XCTest UI flows passed on a task-owned iPhone 17 Pro simulator,
iOS 26.5 build 23F77 with Safari 26.5. They used the original recorded production
build and source-built TSRX runtime 0.1.7, not the subsequent stylesheet-retry
build. This is actual simulator MobileSafari, not desktop responsive mode or
Playwright WebKit, and not physical-device performance evidence.

Body-first, history-first, large-waves, and denied controls held all emitted
JavaScript before native typing, clearing, and retyping. The successful-auth
flows also captured repeated native selections and six trusted early taps:
three in the body and three in history. Releasing framework and composer code
preserved the original textarea, value, focus, and final 13–19 selection while
only the composer was active. Native replacement typing updated the derived
length and the application's Check draft result. Region activation replayed the
early choices to `turn-3` and `conversation-3`, with original node identity and
complete payloads, including all 200/60 rows at revision four. All flows retained
one authorization/server request, no hydration refetch, and no browser errors.
Denied authorization retained the composer and error arms with no private rows;
it has no region selection buttons and does not claim those interactions.

Plain native controls first distinguished SafariDriver synthesis limitations
from actual iOS input. Native XCTest taps and typing worked; ordinary Safari and
keyboard onboarding was dismissed through native UI, with no security preference
changes. The final controls used fresh loopback origins. One earlier reused-origin
run failed parent hydration after a prior held module request was aborted, without
requesting that parent asset again. The same build passed on a fresh origin.
This is a preserved recovery observation consistent with failed-resource caching,
not a proved mechanism, Octane regression, or application-usage explanation.
The failed response's full headers/HTML and initial resource-error target were
not retained; the associated preload tag comes from same-build control HTML.

Evidence is `ios-native-summary.json`, per-flow reports/screenshots/XCTest results
under `ios-native/`, and `ios-simulator-cleanup.json` in the durable directory.
Later history/large/denied flows also retain response HTML/headers and served
asset hashes. All task hosts and drivers ended, the task simulator was shut down
without deletion, and pre-existing simulator states were unchanged. OS IME,
BFCache, paint/INP, real-network recovery, physical-device responsiveness, and
production causality remain open. These diagnostic flows supply no latency claim.

### Fresh size and smoke checks

The rebuilt application's 14 physical JS files total 380,626 raw, 123,761
gzip-9, and 108,018 Brotli-11 bytes, with no CSS files. This inventory is not
a fresh startup-phase or transferred-byte measurement.

The same build's body-first control HTML separates initial inline capture from
the later hydration module graph:

| Emitted code | Raw bytes | gzip-9 bytes | Brotli-11 bytes |
| --- | ---: | ---: | ---: |
| Inline early input/interaction capture and stream-selection receiver | 3,266 | 1,290 | 1,100 |
| All initial executable inline scripts, including that capture | 6,028 | 2,333 | 2,048 |
| Later hydration entry and its static dependency closure | 275,820 | 89,072 | 76,974 |

The capture script installs native listeners without importing the hydration
entry. The second row joins the four executable scripts through the classic
hydration launcher with a newline; it excludes script tags, inert JSON seeds,
and later streamed frames. Its compression is over the joined code, whereas
the external closure sums compression per physical file. These are total emitted
sizes, not incremental RFC deltas or actual HTTP transfer sizes; the overlapping
first two rows must not be added together.

An AST inspection of all 14 hash-verified production JS assets found zero
top-level awaits and zero wildcard star re-exports. It found 14 dynamic import
expressions, which is not a request count or loading-depth measurement. This
fixture therefore does not exercise those two specific WebKit loader bug
triggers; see the [Safari ESM investigation](./safari-esm-investigation.md).

A separate maintained public-export comparison used exact baseline `2789eab27`
with identical bundling options and selected dependencies. All seven
boundary/export checks passed and no consumed inputs changed during the run.
Ordinary client gzip-9 remains 50,695 → 53,205 bytes; synchronous SSR is
13,363 → 15,716. Current-only engine, native-client-hook, and native-server-hook
closures are 14,005, 14,892, and 14,771 gzip-9 bytes. These overlapping closures
must not be added together or substituted for application delivery.

The graph quick run passed five shapes at sizes 100 and 1,000 for both adapters,
plus 100-cycle ownership checks with zero and 100 unrelated graphs. Three-sample
trace controls passed exact retained-sequence checks before and after wrapping.
These quick runs are correctness smoke evidence, with no speedup claim.

Durable local evidence is under
`/Users/callie/code/playwright-runs/octane-async-signals-recheck-20260912.6ytrQm`:
`build/build.json`, `node-1.json`, `node-2.json`, `fresh-summary.json`,
`build/body-first-control.html`, `inline-sizes.json`, `module-graph-inspection.json`,
`safari-4/report.json` and its runner/screenshots/per-flow records, the preceding
Safari diagnostics and plain controls, and `scoped-graph-quick.json` /
`scoped-trace-quick.json`. Export evidence is
`/Users/callie/.codex/octane-bundle-recheck.Cbq7r3/bundles-final.json`.
These are local artifacts; the broader RFC V5/I6 gates remain open.

### Subsequent stylesheet-retry build

The narrow failed-stylesheet retry repair was built separately in
`build-stylesheet-retry/` beneath the same evidence directory. The fixture and
toolchain are unchanged; the only changed client asset is the later hydration
entry, now 5,663 raw / 2,260 gzip-9 / 1,981 Brotli-11 bytes. Its increase is
45 raw / 26 gzip / 21 Brotli bytes. The other 13 physical JavaScript files are
byte-identical, and there are still no CSS files. Total emitted JS is now
380,671 raw / 123,787 gzip-9 / 108,039 Brotli-11 bytes. This is a build/size
comparison, not a latency improvement or a native CSS-network recovery test.

The maintained Node runner then passed all four scenarios and pre/post semantic,
denied, and pre-auth abort controls at three samples per scenario, after native
testing was idle. `node-stylesheet-retry-smoke.json` records this final-build
correctness smoke, not a precision performance comparison. Its body-first HTML
has the byte-identical 3,266-byte early capture script (1,290 gzip / 1,100 Brotli).
All initial inline bodies total 6,028 raw / 2,336 gzip / 2,045 Brotli bytes;
small compression differences from the earlier response include per-build data.

The earlier timing and native-browser results remain attached to their recorded
build. The error-branch fix is independently covered by the generated-entry
regression described in the [implementation ledger](./async-signals-implementation.md).

## Renderer-free behavior-host checkpoint (2026-09-12)

The [behavior-only workload](../benchmarks/conversation-streaming/behavior-only/README.md)
is a distinct production split build: server-owned shell/list HTML, early native
controls, global signals/derivations, and body/history streams behind one shared
authorization query. No browser renderer is resolved, even as a tree-shaken input.
An optional controller imports the same physical state/engine chunk. This is
framework integration evidence, not a lightweight-web build or deployment.

The final emitted browser files have these disjoint sizes, compressed per file:

| Physical delivery | Raw bytes | gzip-9 bytes | Brotli-11 bytes |
| --- | ---: | ---: | ---: |
| Eager behavior entry | 17,720 | 6,093 | 5,465 |
| Shared signal/async runtime and state | 74,204 | 22,137 | 19,835 |
| Optional controller, after activation | 162 | 152 | 123 |
| Total | 92,086 | 28,382 | 25,423 |

Startup is two files, 28,230 gzip bytes. This includes the live async graph,
stream transport/lifecycle, native-control adapter and benchmark application
code; it is not the cost of the tiny capture script or an incremental
lightweight-web budget. The optional controller does not fetch a second engine.
There is no matched old behavior-host implementation, so this is not a speedup
comparison with the earlier native-island fixture.

The signal/input-only inline script remains byte-identical: 775 raw / 440 gzip-9
/ 356 Brotli-11 bytes of code. Its complete script tag is 811 / 457 / 367 bytes
without a nonce. Opting into independent-island intent capture still emits the
previous 3,266 / 1,290 / 1,100-byte code body. These overlapping alternatives are
reported separately from the external files. Capture works before modules; live
derivations require the renderer-free runtime to execute. Early placement shifts
when those bytes are paid, not whether they exist.

After the last correctness repair and repository sync, Playwright WebKit 26.5
passed one warmup and three samples in each of three modes (12 flows total).
Eager behavior became ready while auth and parser EOF were still held. Holding
all external modules preserved native edits into the live signal; untouched
controls accepted a later restore, while intervening edits rejected it even if
the string returned to its original value. Both four-wave streams completed with
one server auth/body/history start and no browser loader. The original textarea
survived; three trusted selection clicks and optional-controller reads agreed.

| Mode | Behavior-ready mark range, ms | Body complete, ms | History complete, ms |
| --- | ---: | ---: | ---: |
| Eager | 12–13 | 106–112 | 125–128 |
| External modules held | 29–32 | 158–159 | 176–177 |
| Pristine restore | 13 | 100–104 | 117–121 |

These are three observed samples per mode, excluding warmups, on Node 24.21.0 /
Darwin arm64 / Apple M5 Max with esbuild 0.28.1 and the approved source-built
TSRX core 0.1.71/runtime 0.1.7. Shell marks are 3–4 ms. Timings are
instrumented DOM observations, not paint/INP or native Safari performance; the
auth hold includes driver work and prevents cross-mode latency comparisons.
No other task build/test workload overlapped this final browser run. A prior
runner timeout had `behaviorReady=true` in its failure snapshot while EOF was
held: explicit timer polling replaces default animation-frame polling for that
readiness check. Product waits or loading behavior were not weakened.

Installed desktop Safari 26.6.2 on macOS build 25G83 separately passes all three
modes against the exact same final build. Native keyboard edits, Backspace
clearing/retyping, focus and backward selection survive pre-module handoff;
trusted Enter-generated day actions, live derivations and optional shared-cell
reads agree. All four stream waves arrive with no duplicate browser loader or
browser error. This is untimed desktop correctness, not iOS/IME/BFCache or native
latency proof. The report, per-mode records and screenshots are in
`octane-behavior-native-safari-20260912.Hye2c2/` beneath the evidence directory;
all owned SafariDriver processes and servers were closed.

The exact-base public-export rebuild also passes all nine build targets. Ordinary
client remains 50,695 → 53,248 gzip bytes (+2,553 over the audited base; +43 over
the preceding committed checkpoint). Synchronous SSR is 13,363 → 15,727 (+2,364;
+11 over that checkpoint). Candidate-only engine, compiled plain-signal module,
and stream/lifecycle bootstrap closures are 14,403, 16,731 and 22,938 gzip bytes.
Those closures overlap and must not be added to the physical delivery table.
Ordinary entries still exclude the scoped graph; shared support is not zero-cost.

Final evidence is `behavior-only-webkit-retention-final-20260912/{build,browser}.json`
and `renderer-free-bundles-retention-final-20260912.json` under
`/Users/callie/code/playwright-runs/`. Source/output hashes, compilation options,
raw samples and request traces are retained. The lists intentionally keep their
first-wave historical HTML; only live outputs and the optional controller read
all later values. Incremental opaque transcript DOM, fetched-navigation timing,
large-payload duplication, physical-device/native IME/BFCache, actual lightweight
delivery and broader V5/I6 budgets remain open. The previous larger-SSR overhead
is not erased or excused by this renderer-free boundary result.

## Distribution diagnostic follow-up (2026-09-12)

A fresh distribution build exposed seven uncatalogued core runtime diagnostics
and a missing published streaming-subpath contract. Codes 65–71 now preserve
their development messages and error classes. The renderer-free document owner
shares code 65, so its production graph adds the small formatter, not a renderer.

Paired builds against `f4e343f` retain two eager files: 91,924 → 92,299 raw bytes,
28,230 → 28,445 gzip-9 bytes (+215), and 25,300 → 25,495 Brotli-11 bytes. Inline
capture is byte-identical (811 / 457 / 367 bytes including its script tag).
Artifacts are `behavior-only-diagnostics-{baseline,candidate}-20260912/build.json`
under the evidence directory above. Recorded runtime dependency hashes and all
compiled fixture outputs match. An interrupted automatic dependency installation
means these reports do not establish equality of every compiler-time dependency.
This is a bundle comparison, not a new browser-timing or lightweight-web result.

The catalog and published-export regressions were observed failing before repair;
12 existing diagnostic/export cases and 944 signal-suite executions pass after
repair. Fresh distribution imports verify the streaming bootstrap and server
exports. Whole-package smoke testing remains blocked locally by the unavailable
React peer dependency; it is not reported as a passing distribution build.
