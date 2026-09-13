# Signal runtime architecture experiments

Control: `8eb93b31506bdc84c0fea55f0df6e31b7f12ed6d`, using the same installed
compiler and dependencies. These are local measurements, not lightweight-web
budgets, deployed behavior, native Safari, or iOS evidence.

## Contract

Signal declarations remain separate from their owned live values. Optional
`createScope`, request isolation, early edit receipts, direct native bindings,
and historical-versus-live values remain unchanged. General `derived$` still
supports a result that changes between scalar, Promise and AsyncIterable.
Selection generations, stream attempts, cancellation, and document suspension
keep their existing authority. There is one graph, not a second lightweight
signal implementation.

The affected paths are plain-module and TSRX compilation, development/production/
Strong compilation, server reads, browser reads and hydration, including thrown
suspension/errors and retirement. Owner resolution is per signal access; derived
evaluation is per invalidation and observed read, not per declaration alone.

## Retained changes

The owner accepts a computation constructor selected by the calling module.
The general async implementation and the scalar implementation satisfy the same
private lifetime interface. This removes the owner's static dependency on the
general implementation without a registry, installation order, dynamic import,
or public Scope change.

The compiler selects the scalar implementation only for primitive-producing
syntax, or a literal `{ sync: true }` on a callback with no formal parameters.
Unknown returns, context callbacks, mutable options and global calls stay general.
In particular, zero arguments and `use strong` do not establish synchronous
results. An unshadowed `String` is still a replaceable global, so it is not proof.

Cached descriptor reads resolve the owner once, then access the cell. They keep
the original retirement/site validation order. Subscription capture keeps its
post-capture validation because a custom owner carrier can retire an owner while
capturing a callback.

### Delivery

Production esbuild, raw bytes and gzip level 9; each public-entry row is an
independent closure and must **not** be added to the other rows.

| Entry                                    | Control raw | Candidate raw | Control gzip | Candidate gzip |
| ---------------------------------------- | ----------: | ------------: | -----------: | -------------: |
| `createScope` + query                    |      48,182 |        42,473 |       13,842 |         12,373 |
| Native client hook                       |      49,854 |        44,145 |       14,758 |         13,278 |
| Native server hook                       |      49,613 |        43,904 |       14,641 |         13,141 |
| Compiled scalar derivation + async query |      55,590 |        50,471 |       16,409 |         15,063 |
| Stream bootstrap and document lifecycle  |      75,844 |        70,234 |       22,659 |         21,151 |
| Complete behavior fixture, eager files   |      85,779 |        85,891 |       26,477 |         26,425 |

Ordinary client and server entries remain byte-identical. The 811-byte raw inline
capture tag is unchanged. Alien Signals remains the actual low-level graph
dependency and contributes 1,848 raw bytes to the shared behavior chunk; the old
Alien binding contributes nothing to this graph.

The complete behavior fixture intentionally retains `String(...)`, which selects
general derivation. Its shared chunk grows 112 raw bytes and drops 52 gzip bytes:
this is **not** a meaningful whole-fixture size reduction. The scalar-friendly
prototype's 5,093 raw / 1,351 gzip saving must not be attributed to this untouched
fixture. The existing compiled-plain-state benchmark uses primitive arithmetic
and legitimately omits general computation code; its guard now enforces that.

### Runtime and correctness

Instrumented reads reduced descriptor routing, owner routing and identity lookup
from two calls to one per cached read. The retained `run-owner-reads.mjs` benchmark
then compared the actual archived and current public APIs, without source
overlays or compiler specialization. A quiet run on Apple M5 Max / Node 24.21.0
used five warmups and 15 paired ABBA/BAAB rounds of 200,000 reads per block:

| Cached read                 | Control mean ns/read | Candidate mean ns/read | Paired geometric ratio (95% interval) |
| --------------------------- | -------------------: | ---------------------: | ------------------------------------- |
| Installed owner carrier     |                39.47 |                  24.81 | 0.628 (0.613–0.644)                   |
| Explicit global owner       |                41.79 |                  24.47 | 0.585 (0.572–0.599)                   |
| Instance-local owner        |                72.36 |                  51.12 | 0.706 (0.694–0.719)                   |
| Alternating instance owners |                76.55 |                  54.60 | 0.713 (0.703–0.724)                   |

This is approximately 29–41% less time in these cached-read loops, not application
latency or Safari performance. The installed carrier is not the browser-default
owner. Subscription ownership, unsubscribe and retirement are untimed correctness
controls, not claimed speedups. All samples and source/dependency hashes are in
`/private/tmp/octane-owner-resolution-experiment/actual-candidate-measured-01.json`.
The earlier overlay prototype and its overlapping preliminary timing are not the
source of these results. See the scoped-signals README for reproduction commands.

The focused suite passed 1,118 tests across 68 project-files, including compiler,
development/production/Strong, SSR, hydration, streams, lifecycle and profile
coverage. Whole-package TSRX typecheck passed. The renderer-free WebKit 26.5 flow
passed three warmups and nine reported flows, including parser-held authorization,
early edits, rejected stale draft restore, repeated selection, independent body/
history streams, and delayed controller loading. This is not branded Safari or
real-device iOS proof.

The production application-shaped SSR control and candidate each passed ten
samples per timed workload plus shared-auth, payload, denied-auth and abort
controls. These runs were not a quiet paired timing experiment; their elapsed
and process-CPU differences do not establish an SSR speedup.

Deliberate faults verified the regressions: omitted scalar resume left a stale
value, unsafe scalar classification exposed a Promise as ready, and omitted
site validation produced the wrong failure. Each fault was restored and the
full focused suite rerun. The first expanded harness incorrectly ran DOM compiler
tests in Node; correcting the harness environment resolved those setup failures.

Sequential independent source review and validation found no actionable core
or benchmark issues. The reviewers did not independently reproduce the browser
or timing runs. The benchmark's archive check also rejected an intentionally
mismatched baseline revision.

## Rejected or unshipped experiments

Savings below refer to isolated prototypes, can overlap, and are not additive.

| Hypothesis                                      | Result                                                 | Decision                                                                       |
| ----------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Delete legacy Scope convenience methods         | 306 gzip bytes saved in complete eager fixture         | Insufficient reason for a breaking change                                      |
| Remove whole-owner inspection/serialization too | 602 gzip bytes saved cumulatively                      | Not a large packaging explanation                                              |
| Server-only observed seed writer                | 500 gzip bytes saved                                   | Useful seam, but prototype breaks serialization surface; not retained          |
| Lazily allocate owner collections               | 12 to 2 initial Map/Set constructions; +124 gzip bytes | Allocation opportunity, not a bundle win; accessor indirection unprofiled      |
| Defer browser query producer                    | 429 additional gzip deletion ceiling                   | Incomplete and changes loader-start timing                                     |
| Consolidate result-channel transfer             | 1,373 gzip deletion ceiling before replacement         | Needs one authority without confusing shared producer and renderer channels    |
| Replace low-level graph with public Alien API   | No measured parity result                              | Dormant invalidation, ownership, historical reads and wrapper costs unresolved |

## Stream optional logic ahead of data — rejected for this effort

After reviewing the measured first-use and total costs, we chose to stop pursuing
on-demand capability delivery for this effort. The observations below remain
useful negative evidence, not the recommended next implementation.

A genuine dynamic-import prototype installed the unchanged general derived
implementation into the existing owner and node. It covered declarations before
loading, pending values, same-graph reads, dependency invalidation, cancellation
and async iterator completion. Rejection and build mismatch were checked; its
initial timeout control failed. A bounded follow-up found a real deadline race:
module-resolution microtasks could run before an overdue timer callback. Checking
a monotonic deadline immediately before installation fixes that race. Removing
the check reproduces the failure. Timeout, late arrival and cancellation controls
now pass in the isolated Node prototype; it is not production or browser-qualified
code.

The corrected isolated prototype defers 606 gzip bytes of initial delivery, but
total delivery after feature loading increases 1,445 gzip bytes. The first
revision's 659-byte saving and 1,392-byte overhead predate the deadline fix.
Deferring only observer code after runtime result detection had a 191 gzip
deletion ceiling. Neither justifies calling on-demand loading a size fix by
itself.

The unmeasured extension was a smaller owner/kernel plus optional
query and computation factories. A build-pinned capability could be announced ahead
of the first dependent data, using a cached module or static nonced code. Incoming
data must have bounded buffering, failure/timeout handling and unchanged selection
authority. Native input and synchronous derived results must not wait for it.
Inline code avoids a request but repeats response bytes; cached modules introduce
first-use readiness and import latency. This larger design is not measured here.

Even a proven async callback can synchronously read inputs or start work before
its first await. Loading its implementation after the first read changes that
timing. The capability must already be installed before invocation, or deferred
start must be an explicit contract. The server can announce a known, build-pinned
module while shared authorization is pending; streamed data must not supply an
arbitrary code string or URL. This remains an unshipped delivery hypothesis; it
is not a replacement for general derived evaluation or the current size strategy.

Local experiment reports and immutable build artifacts are under
`/Users/callie/code/playwright-runs/octane-runtime-loop-*` and
`/private/tmp/octane-{owner,owner-resolution,graph,capability,capability-streaming}-experiment`.
The architecture diagram is an external temporary artifact, not shipped runtime.

## Next ideas: static selection and less repeated work

This round uses exact committed control `e186799a79aef12fe8d93ebebe3742e89ae47b81`.
All candidates are scratch source overlays, not retained product changes. The
owning production behavior build reproduces 67,594 raw / 20,099 gzip bytes for
the shared runtime and 85,891 / 26,425 for all eager browser files. The inline
capture remains 811 / 457. The measurements below are conditional and cannot be
added together or attributed to a rebuilt lightweight-web application.

### First priority: remove query constructors from query-free owners

Implicit signal owners currently construct the same rich `ScopeImpl` used by
explicit `createScope`. Its `asyncSignal$` and native resource constructor methods
directly import the query implementation. Consequently, a query-free consumer
still retains approximately 11.6 kB minified request implementation plus its
observer hook. Alien Signals is not the cause of this retention.

A static prototype passes the existing resource factory from the native query
caller, following the retained scalar computation pattern. There is no dynamic
import, registration, second graph, or delayed producer start. It preserves the
native query path but deliberately disables legacy `Scope.asyncSignal$`.

| Used consumer                                         | Control raw / gzip | Static prototype raw / gzip |
| ----------------------------------------------------- | -----------------: | --------------------------: |
| Native signal, no queries                             |    47,336 / 14,010 |             34,675 / 10,942 |
| Compiled scalar, no queries                           |    49,236 / 14,681 |             36,693 / 11,630 |
| Scalar + real streamed bootstrap and lifecycle        |    72,238 / 21,650 |             59,682 / 18,573 |
| Complete query-using behavior, eager + optional files |    86,058 / 26,578 |             85,833 / 26,566 |

The roughly 12.5 kB raw / 3.1 kB gzip query-free saving is a compatibility-breaking
feasibility result, not a finished implementation. Native query execution and
the full fixture's normalized SSR output remain equivalent, with one auth/body/
history producer start each. This prototype has not passed whole-package
typecheck, the complete runtime suite, or browser qualification.

The inspected lightweight-web Home source and existing emitted manifest point to
an actual eager retention path: composer bootstrap installs document streaming
and constructs an explicit `composer-draft-receipts` scope. Its receipt derivation
is active behavior. Authenticated-history declarations are in a separate cold
chunk and genuinely used. Preserving a rich `createScope` subclass alone would
therefore not remove this composer's query cost: its receipt owner must migrate,
or the legacy convenience surface must change. Preserve equal-value early-edit
receipts, historical/live ownership and synchronous input handling.

Next proof: retain those contracts with static query selection, then compare the
actual Home and conversation build graphs. The existing manifest inspection is
not a fresh matched app build or a served browser test. The explicit receipt
probe uses a simple signal, not the actual object-valued synchronous derivation,
control binding and revision-sensitive draft restore; that migration remains
unproven.

### Second priority: discard provably unused declarations

The plain-module and TSRX compiler paths omit PURE annotations on signal
declarations. A conservative syntax proof lets the bundler discard unused
definitions while retaining argument effects, getter behavior and invalid-call
diagnostics. In a shared module whose scalar export is used, unused async and
query exports cost 7,079 raw / 1,823 gzip bytes that the prototype removes.

Forty matched client/server and TS/TSRX controls preserve outcomes. All-used
controls and every browser and server asset of the full streaming fixture remain
byte-identical. This improves selective imports, not the current Home retention
path. Broader import/shadowing/options controls, typecheck and compiler regression
validation remain necessary before retaining the change.

### CPU follow-up: snapshot incoming seeds without a tagged round trip

`decodeSeed` snapshots and validates an entire already-encoded seed by encoding
and decoding it, then decodes values and re-encodes historical entries again.
Prototypes preserve the immutable historical snapshot while avoiding repeated
whole-tree conversions. With the real 200-row conversation payload, a quiet
Node 24.21.0 run used five excluded warmups and 15 rotating rounds of 40 complete
scope operations per block:

| Operation                                            | Control median ms | Direct snapshot median ms | Shared traversal median ms |
| ---------------------------------------------------- | ----------------: | ------------------------: | -------------------------: |
| Initialize, read and dispose                         |             0.637 |                     0.466 |                      0.480 |
| Begin historical adoption, read, release and dispose |             0.638 |                     0.467 |                      0.471 |

This is approximately 25–27% lower median time in isolated Node seed operations,
not full SSR, application or Safari latency. The direct and shared prototypes add
124 and 79 gzip bytes respectively to the eager behavior bundle. Strict-value,
mutation, accessor, malformed-value and historical/live smoke controls pass;
full regression/typecheck/browser checks remain. The earlier timing run that
overlapped another test process is excluded.

### Ideas that did not earn priority

- Removing redundant producer promises halves allocations in the distinct-pending
  probe (4,000 to 2,000 for 1,000 producers), but only saves 19 gzip bytes across
  all behavior chunks. Timing intervals cross no-change. Allocation evidence is
  useful; it is not a bundle or demonstrated latency solution.
- Flattening graph state saves 44 gzip bytes; simply removing two redundant node
  fields saves 49. The flatter shape adds public snapshot caching complexity and
  does not improve snapshot-heavy allocation counts.
- Native `#private` fields save 37 gzip bytes at ES2022 and add 424 gzip bytes
  when lowered for ES2020. This is not a supported cross-target size strategy.

Scratch evidence:

- `/private/tmp/octane-request-state-next-scalar-Aj9N2r/REPORT.md`
- `/private/tmp/octane-declaration-purity-next-utltWE/README.md`
- `/private/tmp/octane-seed-copy-next-tYNYn2/timing-quiet.json`
- `/private/tmp/octane-request-state-next-qF8JbL/REPORT.md`
- `/private/tmp/octane-graph-representation-next-u648wF/README.md`
- `/private/tmp/octane-private-field-probe.m5nN8m/report.json`

Recommendation: first investigate the statically lean owner against the real
composer receipt consumer. This has the strongest measured query-free size
headroom. The full query workload's remaining cost is still an open problem;
neither this nor unused declaration removal makes that implementation disappear.

## Retained static-owner changes and production bundler check

This round implements the approved compatibility break: `Scope.asyncSignal$` is
removed, and explicit-owner callers import `createResource(scope, key, describe)`.
Native `query$` authoring and optional `createScope` are unchanged. Query callers
supply their constructor statically; there is no capability loader, registration
phase, second graph, or new author import convention. Query and general-derived
facades have separate modules. Compiler-proven unused declarations can be removed
without dropping argument effects, constructor validation, or observable getters.
Incoming seeds use a validated immutable snapshot instead of repeated tagged
encode/decode conversions. Encode-only consumers retain the original traversal.

### The bundler diagnosis changed with a production control

The new composer-receipts fixture keeps eager signal state separate from delayed
query declarations. Both baseline and candidate use those exact same modules,
including a real object-valued synchronous draft receipt, native control binding,
revision-fenced restore, and later auth/body/history queries.

Esbuild 0.28.1 still puts query implementation in the eager graph through shared
barrel imports. A five-module control reproduces that even with pure functions
and `sideEffects: false`. Directly targeting the eager imports fixes that scratch
control, but does not justify imposing a new import convention on applications.

Installed Vite 8.1.5 / Rolldown 1.1.5 and Rspack 2.1.4 both keep the optional
function cold in the minimal control. The **complete receipt fixture** also passes
the Vite boundary without any import rewriting. Accordingly, no production bundler
patch or compiler import-routing layer is retained. The harness now accepts an
explicit `--bundler=vite` client lane; the historical esbuild default remains.
The esbuild receipt guard still fails and is not weakened. Server compilation uses
esbuild in both lanes. This is not a fresh lightweight-web build or its Vite+
configuration; Rspack coverage here is the minimal control, not the full fixture.

Matched Vite builds compare exact `e186799a79aef12fe8d93ebebe3742e89ae47b81` with
the retained candidate using frozen compiler/runtime inputs, identical fixtures,
installed dependencies and compile options. Sizes sum each physical file once;
gzip is level 9. Both eager and eventual graphs matter:

| Consumer / phase                                  | Baseline raw / gzip | Candidate raw / gzip |
| ------------------------------------------------- | ------------------: | -------------------: |
| Composer receipts, eager                          |     86,199 / 25,269 |      67,878 / 20,573 |
| Composer receipts, eager plus optional controller |     86,907 / 25,668 |      81,578 / 24,663 |
| Full-query control, eager                         |     86,247 / 25,347 |      86,855 / 25,402 |

The receipt startup reduction is 18,321 raw / 4,696 gzip bytes (21.3% / 18.6%).
The eventual graph saves 1,005 gzip bytes: much of the startup saving is correctly
deferred work, not deleted query behavior. No request or asynchronous-derived
implementation is emitted in the receipt's eager closure; real query execution
remains in its optional controller. The full-query control grows 55 gzip bytes,
so this is not a general full-runtime size reduction. The inline capture remains
811 raw / 457 gzip bytes and is separate from these module totals.

### Seed work and correctness

A quiet Node 24.21.0 run on Apple M5 Max uses the same real 200-row conversation
payload, five excluded warmups, 15 alternating ABBA/BAAB rounds, and 60 complete
operations per block. Public-value, serialization and historical/live oracles run
outside timing. Consumed baseline sources are verified against Git blobs; all
candidate input and bundle hashes are checked before measurement.

| Operation                                   | Baseline median ms | Candidate median ms |
| ------------------------------------------- | -----------------: | ------------------: |
| Initialize, read, dispose                   |              0.768 |               0.569 |
| Historical adoption, read, release, dispose |              0.788 |               0.578 |
| Serialize an existing owner                 |             0.0705 |              0.0675 |

Initialization/adoption medians fall about 26–27% in this isolated workload. The
smaller serialization difference is not a supported speedup claim. These are not
full SSR throughput, browser latency, INP, or native Safari/iOS measurements.

The focused dev/prod/Strong/runtime/compiler/hydration selection passes 942 tests
across 61 project-files; core and fixture typechecks pass. Fifteen Node bundle and
retainer guards pass. Existing cases were strengthened rather than adding Vitest
cases. Deliberate faults fail for duplicate resource keys, seed snapshot removal,
unsafe PURE elimination and retained general derivation code. Ordinary client and
server public-entry bundle sizes remain unchanged against the established
`8eb93b31506bdc84c0fea55f0df6e31b7f12ed6d` control.

WebKit 26.5 passes nine full-query esbuild samples plus twelve Vite receipt samples
(three excluded warmups and four respectively). Checks cover native early typing,
equal-value edit revisions, pristine/late restore, three trusted day actions,
historical HTML versus final live results, shared authorization, no client loader,
and the same cells after optional controller activation. Neither client resolves
a rendering engine. These are fixture correctness runs, not fresh installed
Safari, iOS, IME or application verification.

The package build emits ESM/CJS/declarations and passes structural verification,
but its all-entry smoke stops on the missing optional React peer. Separate emitted
ESM and CommonJS signals-entry export/resource behavior checks pass; the complete
package/CI gate is not green.

Independent two-pass review finds no remaining actionable runtime, seed or
compiler issue. Final browser-tested client/server artifact hashes exactly match
the final Vite receipt build. Scoped source formatting and `pnpm sync` pass;
unrelated pre-existing formatting in the RFC and acceptance ledger is preserved.

Evidence and repeatable entry points:

- `benchmarks/conversation-streaming/behavior-only/build.mjs --composer-receipts --bundler=vite`
- `/private/tmp/octane-receipts-vite-5VRqm1/report.json`
- `/private/tmp/octane-composer-receipts-e186-PeKbLg/report-vite.json`
- `/private/tmp/octane-receipts-vite-5VRqm1/final-candidate-{receipts,full}/build.json`
- `/private/tmp/octane-request-state-next-scalar-Aj9N2r/real-bundlers/report.json`
- `/private/tmp/octane-static-implementation-WYviJw/seed-builds.json` and `seed-timing-final.json`
- `/private/tmp/octane-static-implementation-WYviJw/final-public-bundles.json`
- `/Users/callie/code/playwright-runs/octane-static-owner-full-20260912/{build,browser}.json`
- `/Users/callie/code/playwright-runs/octane-static-owner-vite-receipts-20260912/{build,browser}.json`

## Static result-only streaming receiver (2026-09-13)

The lightweight application's real Vite+ attribution found unused DOM-placement
code behind `bootstrapStreamedSignalHydration`, even though the host owns HTML
placement and never calls its returned `receiver.registerRegion`. Query deferral
alone mostly moved delivery: the application activates history automatically,
so static initial closure is not the same as delivery delayed until user intent.

The additive `bootstrapStreamedSignalResults` entry uses one existing selection
map, result mailbox, failure latch, deadline and document owner. The full receiver
supplies DOM placement statically and retains its existing public API. There is
no new module loader, installation phase or second result owner. Result-only
ingress still validates all renderer frames and placement ordering; unregistered
placement is stale, never applied. Full placement retains composition cancellation,
style fences, historical leases and completed-result isolation from later failure.

Matched Vite 8.1.5 / Rolldown 1.1.5 builds compare the immediately preceding dirty
lean source with this extraction. The only receipt authoring change selects the
new named bootstrap; server data, controls, query modules, compiler and build
options are unchanged. The untouched full-query fixture retains the full bootstrap
as a compatibility/cost control. Raw/gzip-9 bytes count each physical file once:

| Consumer / phase                    | Before raw / gzip | After raw / gzip |
| ----------------------------------- | ----------------: | ---------------: |
| Composer receipts, eager            |   67,878 / 20,573 |  63,737 / 19,370 |
| Composer receipts, eventual         |   81,578 / 24,663 |  77,437 / 23,460 |
| Full bootstrap/query control, eager |   86,855 / 25,402 |  86,993 / 25,519 |

The receipt path removes 4,141 raw / 1,203 gzip bytes from both startup and eventual
delivery; this saving is not deferred to another chunk. Full bootstrap grows 138
raw / 117 gzip bytes in this fixture. A separate esbuild public-entry check puts
result bootstrap plus document lifecycle at 53,281 raw / 16,484 gzip bytes versus
58,503 / 18,196 for the new full bootstrap. These are different harnesses, not
additive savings. The inline capture remains byte-identical at 811 raw / 457 gzip.
No application saving, latency, INP or native Safari benefit is claimed from these
fixture measurements; this modest reduction cannot resolve the application's
roughly 33.6 kB Home-plus-prewarm gzip overage by itself.

Validation: 228 focused checks in 21 dev/prod/Strong project-files; core and fixture
TSRX typechecks; 15 Node bundle/retainer checks; all ten public-entry builds and
export-load guards. Existing Vitest cases were strengthened without adding test
declarations. A test-loader fault removing placement sequencing fails the duplicate
placement oracle, and the normal implementation passes in all three modes.
Ordinary client/server entry sizes remain unchanged against the established
`8eb93b31506bdc84c0fea55f0df6e31b7f12ed6d` control.

Playwright WebKit 26.5 passes twelve result-only receipt samples plus four excluded
warmups and nine full-bootstrap samples plus three warmups. Browser-tested client
and server hashes match the measured candidate, with no consumed-source drift.
This covers early/equal-value edits, restore, three actions, auth-first streams,
historical HTML/live results and deferred query joining, not native iOS, actual
application performance or incremental DOM placement. The existing full-region
correctness suites cover placement/style/composition cancellation and cleanup.

Evidence:

- `/private/tmp/octane-result-boundary-uqWw7o/PLAN.md`
- `/private/tmp/octane-result-boundary-uqWw7o/{baseline,candidate}-{receipts,full-query}/build.json`
- `/private/tmp/octane-result-boundary-uqWw7o/{vitest.config.mjs,fault.config.mjs,correctness.json,public-bundles.json}`
- `/Users/callie/code/playwright-runs/octane-result-boundary-{receipts,full}-20260913/{build,browser}.json`

Independent two-pass source review found no actionable issue. Twenty scoped files
pass formatting, `pnpm sync` passes without additional tracked generated changes,
and `git diff --check` is clean. The fresh package build emits ESM/CJS/declarations
and passes structural verification; the new emitted hydration APIs and both result
receiver flows pass a separate smoke. Its all-entry smoke still stops at the
missing optional React peer in the interoperability entry, not the result path.
Complete package/CI, publication and lightweight's actual budget remain open gates.

## Home budget follow-up: rejected small cuts (2026-09-13)

The next target is actual modern Home startup at no more than 6,000 gzip bytes
above the existing application limits: 45,500 bytes for initial Home and 51,750
for Home plus prewarm. The existing limits remain 39,500 and 45,750; this target
does not authorize changing them or claim that their checks pass. Before the
result-only receiver update, application candidate1 measures 73,617 and 79,380
bytes respectively. Its actual application rebuild owns the next result, not
the isolated fixture below.

Three bounded experiments use the current uncommitted result-only source as
their baseline, not clean `e186799a79aef12fe8d93ebebe3742e89ae47b81`. None is retained
in product code:

| Experiment                                                      |                                        Measured gzip effect | Decision                                                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------: | ------------------------------------------------------------------------------------ |
| Move native read-source construction to the existing observer   |       Compiled scalar entry -29 bytes; result bootstrap -37 | Reject complexity for negligible savings; native collector control grows 33 bytes.   |
| Static public scope helpers and explicit debug constructor      | Receipt eager/eventual -437 bytes; full-query eventual -498 | Reject public API churn; real serialization and historical adoption remain required. |
| Remove generic transport adapter, retaining the result receiver |                           Receipt eager/eventual -747 bytes | Unsafe ceiling only; rejects fewer oversized frames than the baseline.               |

The observer experiment uses esbuild 0.28.1 public entries, including the real
compiler-selected scalar path. Value, subscription and native metadata controls
match; the ordinary renderer entry is unchanged. Owner and transport experiments
use the complete Vite 8.1.5 / Rolldown 1.1.5 receipt fixture and unchanged full-query
controls. All figures are separately compressed final-output gzip-9 comparisons,
not additive module contribution estimates or actual Home savings.

The scope experiment preserves one owner/graph, historical/live leases, query
deduplication, cancellation, trace ordering and detached serialization in its
Node controls. Its public type migration is incomplete. The transport ceiling
passes late-descriptor adoption without a browser fetch but **fails** an explicit
1,024-byte frame-budget control: it publishes a 2,048-byte value that the baseline
rejects. Receiver and engine mailboxes represent different readiness states and
usually transfer ownership rather than duplicate frames; engine acceptance does
not replace transport validation. No browser or runtime-speed claim is made for
these rejected candidates.

A further attribution-only ceiling removes serialization and the entire
historical adoption implementation while preserving initial seed decoding, live
signals, streamed acceptance and retirement. Even this deliberately broken
variant saves only 1,155 receipt gzip bytes, or 1,519 combined with the helper/debug
experiment. It does not justify a broad protocol redesign for this budget target.
Separately, complete public-entry measurements put writable signals plus result
bootstrap/controls at 18,664 gzip bytes and the actual eager receipt derivation at
18,726. Removing that application derivation alone cannot shed the graph: the
current bootstrap and writable paths already retain it. These are measured
retention controls, not theoretical lower bounds or proof the Home goal is
impossible.

The application attribution also separates additional external JavaScript from
code moved out of inline HTML. Moving code back into HTML, delaying automatic
history work, or dropping required early-edit behavior is not accepted as removal
of the migration's cost. The 6,000-byte target remains unmet at this checkpoint.

Evidence:

- `/private/tmp/octane-native-source-cut-WSPBwI/report.json`
- `/private/tmp/octane-owner-static-next-nnJTzd/{REPORT.md,report-verified.json}`
- `/private/tmp/octane-owner-static-next-nnJTzd/ceiling-report.json`
- `/private/tmp/octane-required-startup-map-GWX5ox/report.json`
- `/private/tmp/octane-result-ingress-next-xqDvPh/{REPORT.md,report.json,controls.json}`
- `/Users/callie/code/playwright-runs/lw-async-signals-lean-20260913/measurements/candidate1/findings.md`

### First integrated result: candidate2b

The real application build at
`f9bbdf5443c3050b892b78ee4b5f7a09b5157d83` adopts the result-only receiver and
updates its existing manual-chunk classifier for the new source file. The first
integration omitted that classifier entry, creating a static cycle and a browser
initialization failure before receiver defaults were assigned. Its evidence is
preserved; candidate2b fixes the grouping and passes the unchanged cycle guard.

With identical recorded build conditions/toolchain, modern Home measures
222,537 raw / 72,363 gzip / 63,816 Brotli bytes in eight JavaScript assets. Home
plus prewarm is 237,755 / 78,135 / 69,023 in eleven assets. Compared with candidate1,
the actual gzip reductions are 1,254 and 1,245 bytes respectively. The ordinary
prewarm guard still fails by 32,385 bytes; the additional 6,000-byte target remains
26,385 bytes away for prewarm and 26,863 for initial Home. No cap changed.

The immutable production-artifact Chromium fixture passes auth-first body/history
delivery in both completion orders, retaining early draft text, selection and the
same connected editor node, with no page errors. Its service 503/aborted telemetry
requests remain recorded; this is synthetic-account fixture evidence, not a fresh
Safari/iOS, real-account or latency qualification. Further application ledger and
image-history import cuts are not included in these numbers.

- `/Users/callie/code/playwright-runs/lw-async-signals-lean-20260913/measurements/candidate2b/delivery-comparison.{md,json}`
- `/Users/callie/code/playwright-runs/lw-async-signals-lean-20260913/bundle-guard-candidate2b.log`
- `/Users/callie/code/playwright-runs/lw-async-signals-lean-20260913/candidate2b-qa/history-stream-dom/stream-dom-receipt.json`

### Application dependency cuts: candidate3

The next immutable build isolates the operation ledger's synchronous readers and
the image-draft retirement accessor from their heavier implementations, preserving
the same application-owned state. Finalization and 226 existing focused tests pass;
the production build records 2,265 matching input hashes. Modern Home falls to
212,353 raw / 69,512 gzip / 61,474 Brotli bytes in eight assets, with Home plus
prewarm at 75,260 gzip bytes in eleven assets. This is another 2,851 / 2,875 gzip
reduction versus candidate2b, not a complete budget result: the initial/prewarm
targets still require removing 24,012 / 23,510 bytes.

Much of this cut restores later delivery to existing owners. Automatic Home
delivery after the initial closure grows from 95,802 to 97,815 gzip bytes; the
entire manifest-reachable graph grows by 16 bytes. The latter includes mutually
exclusive features and is not page weight. Do not describe the initial 2,851-byte
reduction as deletion of all that implementation. Complete matched Home HTML
remains 375,388 raw bytes, critical CSS is identical, and separately compressed
HTML plus all explicit initial JavaScript falls from 195,609 to 192,764 gzip bytes
(original baseline 177,421). Current-candidate browser qualification is tracked
separately by the application task.

A separate read-only audit rules out replacing the whole standalone HTML-update
runtime with Octane's range receiver as a small change. It also owns live rich
turn reconciliation, hydrated island preservation, word/list presentation, Stop,
settlement and commit receipts. Initial authenticated history/body already use
Octane streaming. Saved-navigation's single completed range is a possible narrower
protocol migration, but would not eliminate the runtime while first Send needs it.
Classic/ESM duplicate delivery is being measured separately; no corresponding
initial-cap saving is claimed here.

- `/Users/callie/code/playwright-runs/lw-async-signals-lean-20260913/candidate3/source-input-hashes{,-after}.json`
- `/Users/callie/code/playwright-runs/lw-async-signals-lean-20260913/measurements/candidate3/delivery-comparison.{md,json}`
- `/Users/callie/code/playwright-runs/lw-async-signals-lean-20260913/measurements/candidate3/authenticated-document-comparison.{md,json}`
