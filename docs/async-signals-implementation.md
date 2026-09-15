# Async signals: implementation and acceptance

This guide explains how the [accepted RFC](./async-signals-streaming-ssr.md)
maps to Octane's implementation. It separates supported behavior, implementation
choices, measured results, and unfinished acceptance work.

The earlier published validation checkpoint `ac8f008e9` is recorded in
[PR #1069](https://github.com/octanejs/octane/pull/1069).
Its [26-job CI run](https://github.com/octanejs/octane/actions/runs/34922143270)
and automated review passed. Those results do not establish every browser,
performance, or deployment requirement in the RFC.
The renderer-free follow-up and integration with upstream `777cef385` are documented below; consult the PR for the current head's CI state rather than applying the earlier checkpoint to later changes.

## What authors get

- `signal$(initial)` declares writable state. Module declarations are supported;
  server values are request-local, while browser values belong to a document.
  `createScope` remains available for an explicitly managed lifetime.
- `derived$(compute)` is read-only computation. It can return a synchronous
  value, Promise, or async iterable. Synchronous values remain synchronous.
- `query$(select, load)` is a read-only keyed resource. It starts only after
  its tracked selector succeeds, shares matching requests, and supports
  `skip`, quiet `refetch()`, and explicit `reset()`.
- `value={draft$}` and `checked={selected$}` bind writable handles two-way on
  native controls. Read-only handles and `.get()` expressions do not write back;
  this does not set the HTML `readOnly` attribute.
- A server result can arrive before the consuming widget's code. The widget
  adopts that result instead of starting the same initial browser request.
- User edits made before activation survive late initial values and delayed
  restore attempts. An edit revision matters even when the text returns to its
  original value.

Use [the signals guide](./signals.md) for the public API and
[deferred hydration](./deferred-hydration.md) for activation and DOM ownership.
The RFC's `renderDocument`/`hydrateIsland` host sketches are not current exports.

## Three integration paths

| Path | Who owns the DOM? | What Octane supplies |
| --- | --- | --- |
| Native Octane rendering and hydration | The renderer owns its component ranges | Direct signal bindings, historical-state adoption, keyed updates, independent widget activation |
| Server-owned HTML with signal results | The host owns structure and replacement | `bootstrapStreamedSignalResults`, document signals, early edits, result adoption, optional native-control adapters |
| Renderer-free authored presentation | The host owns the enclosing range; compiled bindings own declared presentation and controls | `adoptBindings`, `mountBindings`, keyed structure, property updates, synchronous refresh, cleanup |

For hosts that also delegate streamed HTML placement to Octane,
`bootstrapStreamedSignalHydration` adds `receiver.registerRegion`.
Install either that bridge or the results-only bridge, not both for the same
document. Both use the same result identity and lifetime rules.

**Renderer-free does not mean JavaScript-free.** The inline
`earlySignalBootstrapScript()` captures edits and incoming data without importing
a renderer. Live reads, subscriptions, derivations, and async computations need
the renderer-free signal engine. A host that needs those behaviors before
interaction must deliver that engine and its handlers early.

**Authored presentation is not unrestricted component execution.** The current
`'use dom bindings'` view supports compiler-proven text, conditionals, keyed lists,
pure child views, slots, native controls, and attributes/classes/styles. Unsupported
effects, ownership, and arbitrary calls fail extraction. Whole/spread styles use
the canonical native style reader through an optional capability; fixed properties
keep their scalar fast path. Writable `value`/`checked` handles select the canonical
control adapter; read-only handles and sampled `.get()` values never write back.
Owned `checked` requires a fixed checkbox/radio type. Native input synchronizes
bound radio-group members, not entirely unbound targets or programmatic sibling
writes. The explicit `bindSignalControl` API remains available for host-owned DOM.
Streamed data updates a list only through an authored binding or an explicit host
placement policy; receiving data alone does not mutate structure.

## Core implementation map

These are the main source owners, not extra layers an application must construct.

| Responsibility | Source | Why it exists |
| --- | --- | --- |
| Declaration identity and live ownership | [facade.ts](../packages/octane/src/signals/facade.ts), [owner-context.ts](../packages/octane/src/signals/owner-context.ts), [document-owner.ts](../packages/octane/src/signals/document-owner.ts) | One declaration can resolve to separate request or instance values without process-global mutable state |
| Dependency graph and historical reads | [graph.ts](../packages/octane/src/signals/graph.ts), [engine.ts](../packages/octane/src/signals/engine.ts) | Track invalidation, retain complete results, and read the values that produced existing HTML during adoption |
| Async derivations and queries | [computations.ts](../packages/octane/src/signals/computations.ts), [requests.ts](../packages/octane/src/signals/requests.ts) | Reject obsolete results, close iterators, and distinguish partial values from completed streams |
| Compiler identity and async reads | [signal-declarations.js](../packages/octane/src/compiler/signal-declarations.js), [signal-attempt-reads.js](../packages/octane/src/compiler/signal-attempt-reads.js) | Generate matching server/client IDs and bind proven post-`await` reads to the producing attempt |
| Native bindings and early input | [control-binding.ts](../packages/octane/src/signals/control-binding.ts), [early-values.ts](../packages/octane/src/signals/early-values.ts), [runtime.ts](../packages/octane/src/runtime.ts) | Preserve native edits and update only the properties a binding owns |
| Server frames and observation | [runtime.server.ts](../packages/octane/src/runtime.server.ts), [server/streamed-signals.ts](../packages/octane/src/server/streamed-signals.ts) | Capture rendered values and independently deliver query results with matching identities |
| Browser transport and placement | [streamed-signals.ts](../packages/octane/src/hydration/streamed-signals.ts), [stream-delivery.ts](../packages/octane/src/hydration/stream-delivery.ts), [stream-receiver.ts](../packages/octane/src/hydration/stream-receiver.ts) | Validate and bound incoming work before updating data or replacing an authorized DOM range |
| Renderer-free authored presentation | [compiler/dom-bindings.js](../packages/octane/src/compiler/dom-bindings.js), [dom-bindings.ts](../packages/octane/src/dom-bindings.ts) | Compile a fixed view into a snapshot projector; validate nodes and release property claims without removing host DOM |
| Actions and contextual server calls | [actions.ts](../packages/octane/src/signals/actions.ts), [app-core server integration](../packages/app-core/src/server/) | Keep optimistic operations separate from restartable reads and inject trusted request context |
| Build and document lifetime | [document-lifecycle.ts](../packages/octane/src/hydration/document-lifecycle.ts), [app-core](../packages/app-core/src/), Vite/Rspack/Rsbuild integrations | Match executed code to server metadata and retire or suspend obsolete document work |

The graph still uses `alien-signals/system` for low-level dependency propagation.
Octane adds ownership, async attempts, historical reads, and transport around it;
there is no second renderer-free graph.

## Important implementation choices

### Declaration identity is not a global mutable value

The compiler supplies stable declaration and instance identities. A module-level
declaration can be reused across requests without sharing its live cell. Browser
roots and independently activated widgets join the same retained document owner.
Server access without the appropriate request owner fails; it cannot fall back
to a process-wide store.

### Async results belong to a particular attempt

A query selection and an execution attempt are different identities. Reads after
`await` must still belong to the attempt that began the computation. The compiler
rewrites supported reads to an explicit attempt reader; opaque helpers require
that reader explicitly. There is no ambient Promise instrumentation.

Before publication, dependency versions and retirement state are checked.
Cancellation alone is insufficient: a producer may ignore its abort signal.
Late values and iterator yields must still be rejected.

### Historical HTML and live state are different

Hydration first reads the historical values that produced its existing HTML.
It then releases that read frame and observes current live values. A user edit
or newer result does not retroactively change what an older HTML segment
represents.

For navigation, selection generation controls whether content may be shown;
source revision controls freshness; attempt and sequence order transport.
Returning A → B → A creates a new selection generation. A cached segment cannot
replace the current view merely because its bytes arrived last.

### Input handoff preserves native behavior

Early capture records both value and edit revision. When behavior starts, it
adopts accepted edits before delayed restore candidates. Installing the full
binding must not publish a duplicate edit or replace the original control.

Replaceable selections keep the latest choice. Distinct actions retain one
delivery each. Replayed events cannot recreate trusted user activation or
synchronously cancel an earlier browser action; those cases need an early handler.

Command inputs are separate from live editor state. An eagerly registered
behavior may use `captureEvent` to snapshot detached immutable input and receive it
as the fourth `handleEvent` argument after readiness. Two Saves preserve A and B
even if the editor has already changed to B or been cleared. This hook cannot
recover inputs from before registration; the default inline mailbox only preserves
the latest control state. The queue keeps the existing owner and target fences.

### Streams settle independently and stay bounded

HTML visibility and signal-result delivery are separate. A slow stylesheet or
one pending region must not block unrelated results. Each result channel validates
its identity and sequence and has limits on queued frames, bytes, and lifetime.

Failed producers still emit an opening frame before their terminal error.
Malformed input, missing completion, timeout, and disposal settle affected
consumers rather than leaving them pending or starting an automatic replacement
request.

### Writes are not restartable reads

Actions pin their operation ID, owner, and selection. A definitive rejection can
remove an optimistic overlay; a lost acknowledgement remains uncertain.
Navigation can detach a view without canceling already accepted server work.
The host owns authorization, durable receipts, idempotency, and explicit Stop.

Concurrent server receipts need `optimistic$(source$, { compareAuthority })`.
The comparator uses real source authority, excluding overlays: an older or equal
receipt settles only its own operation without replacing a newer value. Owners
and selection generations still fence adoption. Unversioned arrival-order adoption
remains available for local uses, not as a server-freshness guarantee.

GET parameters only initialize read-only state, prefill input, or select an
already accepted receipt. The conversation fixture accepts writes through an
authenticated POST with strict same-origin `Origin` and JSON checks before
dispatch; its receipt-only redirect and later hydration do not repeat the write.

Finite read batching uses `batchServerCalls({ kind: 'independent-reads', ... })`.
Each member is authorized separately and can finish independently. Writes and
multi-yield subscriptions do not silently join that finite batch.

### Optional implementations are selected statically

Query construction no longer hangs off every scope. Explicit-owner resource
callers migrate from `scope.asyncSignal$(key, describe)` to the imported
`createResource(scope, key, describe)`; normal `query$` declarations are unchanged.

The compiler can select a smaller scalar derivation only when its proof permits
it. `'use strong'` alone does not prove that a result is synchronous or remove
publicly reachable methods. Unused declarations can be discarded only while
preserving argument effects, getters, and invalid-call diagnostics.

The general `derived$` path inspects the result when a computation runs, not the
producer's constructor. Imported functions returning promises remain valid,
without forced `async` syntax, eager classification, or a microtask for immediate
values. Writable `signal$` stores functions as data. Custom-class serialization
and a devalue migration remain outside the streamed-signal codec contract.

The results-only receiver and dependency-free class-normalization helper remove
unneeded eager dependencies. These are static module boundaries, not runtime
capability downloads. The [experiment report](./async-signals-runtime-experiments.md)
explains the alternatives that were rejected.

## Correctness observations that changed the implementation

| Observation | Correction |
| --- | --- |
| A dependent query resumed after authorization outside the renderer observer, so its results were absent from the initial response | Retain the appropriate observer across the pending description; release it on retirement |
| Hydration adopted historical HTML but direct bindings missed the switch to live state | Register the historical-frame release notification without adding broad rerenders |
| Unresolved producers retained retired scopes or iterators | Use revocable attempt references and clear retained producer results |
| A plain-module memo optimization skipped signal declaration edits | Keep the signal-aware transform for mixed signal/memo modules; preserve the memo-only optimization |
| A rejected producer emitted an error before opening its channel | Emit the opening frame first, including iterator-construction failures |
| A failed framework-created stylesheet stayed cached forever | Remove failed loads from the cache so a later requested activation can retry |
| In a held-open response, the tested WebKit module entry waited for HTML EOF | Use the streaming host's nonce-bearing classic `import()` launcher; reject unsupported fetch policies explicitly |

These observations have behavioral regressions or maintained fixture controls.
The WebKit result is a specific open-stream observation, not an explanation for
all Safari loading problems. See the [Safari investigation](./safari-esm-investigation.md).

## Validation and remaining limits

### Renderer-free controls and styles follow-up

The candidate now builds with the normally installed, frozen dependency lockfile: TSRX core/runtime 0.2.0 and OXC 0.13.0, without a dependency override. Compiler-selected controls and whole/spread styles use the same native adapters as their explicit APIs. A binding-only activation no longer imports the renderer's collection driver. The exact chained-string extraction example is exercised alongside rejection cases for opaque or mutating calls. Sampled numeric values retain native coercion and number-input equality; nullish values leave the control uncontrolled. These ordinary values do not acquire a signal writer or relax writable-handle validation.

The upstream ViewTransition integration preserves committed control sources and listeners until native publication, stages authored text and structural changes, and runs deferred cleanup under the exact retiring signal owner. Regression faults reproduce early text publication and cleanup reading the wrong owner. An already-committed signal update drains only its own development diagnostic so that diagnostic cannot accidentally interrupt an unrelated held transition. Ordinary asynchronous server components can still compose cached markup after `await` when no render pass is active; that path does not invent a request owner.

All five signal test modes pass 635 cases. Renderer-free behavior passes 49 cases in each of development and production; public control handoff passes six; native-read compiler/collection/plain-module coverage passes 75 in each mode. Public types, selected runtime types, distribution build/import checks, and 26 streaming-workload/bundle-boundary/fragmentation cases pass. These overlapping lanes are not added together. Full-core validation and current-head CI are separate gates.

Production-compiled controls pass in Chromium and Playwright WebKit 26.5 using actual server control receipts and the inline bootstrap. Early typing, original node identity, focus and selection survive adoption; writable and sampled controls, nested styles, and the chained-string example behave as declared. Composition events exercise the guard but do not establish operating-system IME behavior. The matched rich streaming workload passes six measured WebKit cases plus two warmups per mode, including A → B → A navigation and retained map selection. The authored mode imports no renderer.

Matched minified esbuild closures against parent `083d0c179` isolate the optional capabilities. The last three rows are complete capability closures, not increments or independently additive costs:

| Entry | Parent gzip bytes | Candidate gzip bytes | Increment |
| --- | ---: | ---: | ---: |
| Scalar authored bindings | 3,363 | 3,653 | 290 |
| Structural authored bindings | 7,942 | 8,286 | 344 |
| Optional control leaf | — | 3,216 | No matching parent entry |
| Optional whole-style leaf | — | 2,216 | No matching parent entry |
| Scalar bindings with controls and whole styles | — | 7,936 | Combined closure |

The scalar and structural entries exclude both optional leaves. These closure sizes are not an application's home-route increment. In the matched rich Vite fixture, the renderer-free entry is 35,053 gzip bytes versus 98,229 for the renderer-backed entry; both share an 811 raw / 457 gzip byte inline capture script and a 92 gzip byte lazy interaction chunk. The fixture includes its signal/query engine, transport, authored view, and benchmark driver; it is not an isolated binding-runtime measurement or proof of the application startup budget.

Against the same upstream `777cef385` source and toolchain, the ordinary `createRoot` closure is 56,499 versus 53,285 gzip bytes (+3,214), and the ordinary `renderToString` closure is 17,360 versus 14,886 (+2,474). These compare the entire RFC branch to upstream, not just this follow-up. Neither retains the optional signal graph or control/style adapters. Comparing instead to the older RFC parent would also charge upstream ViewTransition work to this follow-up, so those baselines must not be conflated.

At the pre-integration follow-up checkpoint, the native-presentation benchmark used the actual StyleX compiler and canonical native reader. For 5,000 progress updates, targeted subscriptions removed 5,000 whole-source snapshots, 25,000 projected reads, and 5,000 StyleX merges while retaining the same terminal DOM. Seven-sample median synchronous update time was 12.72 ms versus 23.71 ms for whole-source projection; unrelated updates were 4.78 ms versus 14.30 ms. These happy-dom measurements establish work avoided, not browser paint, input latency, a final merged-head timing, or production speedup. An actual style variant change still performs its required merge.

### Earlier core-feedback checkpoint

The September 15 core-feedback follow-up added controlled regressions for event-time command snapshots, reverse-order authoritative receipts, and safe GET/POST entry. The previous implementations reproduced missing payloads, revision rollback, and GET-triggered mutation respectively. The fixes passed 238 existing signal test cases, 52 behavior/bundle cases in each of development and production, six existing browser lifecycle cases, and four existing production integration scenarios. Production-built Chromium 149 and Playwright WebKit 26.5 both preserved A/B submissions and Save-then-clear through delayed real signal binding; 21 additional measured WebKit streaming scenarios plus warmups passed. These lanes overlap and are not summed into a unique-test count. Scoped source/public types, formatting, repository sync, and existing shell-fragmentation/bundle-boundary checks also passed. At that checkpoint, missing unrelated dependencies prevented the root local Vitest run; that installation blocker has since cleared. Installed Chrome automation was blocked by managed DevTools policy; Playwright engine results do not establish installed Safari/iOS qualification.

Matched production full-query and receipt streaming fixtures retain byte-identical inline, client, and server output relative to `aff08430c`; neither imports these optional action/behavior APIs. Separate minified esbuild API closures measure the changed code: behavior capture adds 403 raw / 125 gzip / 101 Brotli bytes; action authority ordering adds 857 / 211 / 181 bytes; the combined closure adds 1,263 / 331 / 308 bytes. Both variants retain the same renderer-free module boundary. The default inline capture remains 811 raw / 457 gzip / 367 Brotli bytes including its script tag. These are incremental bundle measurements, not a latency improvement or application startup-budget qualification.

At runtime checkpoint `61e51dd8b`:

- The full 26-job CI matrix and automated review passed. One parity shard first
  ended on a browser/RPC disconnect without an assertion failure; one fresh-runner
  retry passed with unchanged code and checks. The transport cause is unconfirmed.
- The wider local integration run on parent `f9bd88e8e` passed 5,632 assertions
  plus 28 expected-failure cases across 168 test-file runs. The server-error
  follow-up passed 147 delivery/receiver/automatic-streaming executions.
  Overlapping suite counts are not added together.
- Core/public types, distribution build/import checks, sync, and scoped
  formatting passed. Local checks used source-built TSRX core 0.1.71/runtime
  0.1.7; they are not evidence of published-tarball identity. A local formatter
  download failed, so full-workspace local gates are not claimed in place of CI.
- Matched manual/authored Vite builds passed 12 measured WebKit 26.5 cases per
  variant plus warmups. The final server-error fix leaves all measured client
  assets and inline capture byte-identical to its parent.

Earlier desktop Safari and simulator runs apply only to their recorded builds.
They are not final-head iOS or physical-device proof. Native IME, persisted
BFCache, interrupted-network recovery, mobile first-click latency, feature-off
shared support cost, and broad application performance remain open.

The rich authored workload now exercises live paragraphs, keyed lists, links,
title/progress revisions, placeholder-to-map activation, and A-to-B-to-A
navigation without a renderer import. It has a matched renderer-backed mode;
both preserve survivor identity and retained per-conversation intent. These are
local compiled fixtures, not production authentication, real map-SDK, native IME,
or application startup-budget qualification. The earlier data-only workload still
does not establish structural list updates.

The following checklist retains the RFC requirement IDs. Checked items record
implemented behavior and its scoped evidence; unchecked items identify remaining
acceptance work, not an invitation to weaken the contract.

## Requirements and required evidence

### State and author API

- [x] S1: `signal$(initial)` works globally and inside stable instances without
  explicit scope/key. Concurrent server requests never share mutable cells.
- [x] S2: Browser modules/independent widgets join document cells; disposal and
  account/feature retirement fence old work. Signals-only imports remain DOM-free.
- [x] S3: `derived$` supports sync/Promise/AsyncIterable with one read model;
  existing scoped function values and hook lazy initialization remain compatible.
- [x] S4: `query$` selects synchronously, deduplicates canonical arguments, supports
  skip/idle, quiet refetch/reset, and does not start through pending dependencies.
- [x] S5: Strict `get`, initial `isPending`, snapshots, partial/complete streams,
  whole `latest`, transitive provenance, and historical leases retain meaning.
- [x] S6: Post-await direct/local-helper reads are compiled to revocable attempt
  reads; explicit readers support opaque helpers with actionable diagnostics.
- [x] S7: Invalidation fences obsolete Promise results and every iterator yield,
  including ignored abort, changed dependency discovered late, and disposal.
- [x] S8: Compiler IDs match server/client builds, distinguish repeated/keyed
  instances, validate conflicting bootstrap, and never depend on process counters.

### Direct DOM and early interaction

- [x] D1: Direct writable native value/checked handles bind two-way; readonly
  handles and `.get()` remain one-way. Aliases/props use real handle capability.
- [x] D2: Direct text/attribute/per-property style bindings (including spreads)
  update targeted slots; static/scalar style lowering, ordering, and cleanup survive.
- [x] D3: SSR initializes only needed tracked-read state plus explicit inclusions;
  early receiver runs before result/placement scripts and before widget modules.
- [x] D4: Early capture preserves typing and clearing before modules load. Once
  the signal engine runs, edits update live cells immediately; stale storage/SSR
  candidates cannot overwrite them. Handoff introduces no extra write/event.
- [ ] D5: Original nodes, focus, caret, selection, and IME survive hydration,
  superseding HTML, restoration, and concurrent handoff.
- [x] D6: Discrete actions deliver once to the matching widget; replaceable
  selections coalesce to latest without coalescing unrelated actions.
- [x] D6a: An eager command capture policy preserves A → Save → B → Save as A/B
  submissions while the editor stays B, and A → Save → clear as A/empty. Inputs
  captured before readiness survive once-only delivery; retired owners drop them.
- [ ] D7: Native navigation stays native; synchronous preventDefault/trusted
  activation requires early code. Mobile first-click delay is measured.

### SSR, wire protocol, and lifecycle

- [x] R1: Initial and later-fetched HTML/data progress independently; fast siblings
  reach the parser without waiting for slow siblings or full-response buffering.
- [x] R2: Frames validate protocol/build/document/owner/instance/node/selection/
  attempt/sequence; result-before-code adoption avoids duplicate initial fetch.
- [x] R3: Each placed range uses its exact historical read frame; live newer
  values do not rewrite history during adoption. Commit revalidates dependencies.
- [x] R4: Selection generation and authoritative source revision are distinct;
  A→B→A, stale cache, out-of-order chunks, and old attempts cannot seize the view.
- [x] R5: Dormant placement validates identity/styles before mutation and preserves
  early input. Active renderer is the only DOM owner; ordinary data updates do
  not blindly replace HTML or append duplicate turns.
- [x] R6: Codec preserves supported undefined/negative-zero data and rejects
  cycles/accessors/unsupported prototypes; script/HTML delimiters are escaped.
- [x] R7: Malformed frames, missing terminal/EOF, timeout, overflow, unavailable
  style, build mismatch, abort, and source failure recover locally and settle once.
- [x] R8: End-to-end bounds pause producer `next()` under pressure; large streams
  exceeding 1 MiB are supported under explicit policy without quadratic work.
- [ ] R9: BFCache/pageshow, account change, owner retirement, and supported build
  recovery preserve compatible content without accepting stale authority.

### Independent activation and caching

- [x] I1: Compiler manifest proves module/export/captures/stable IDs/hook seeds/
  historical reads/styles/version. Unsupported independent extraction fails clearly.
- [x] I2: Interacting with a nested widget evaluates neither parent nor sibling
  modules; styles are available before reveal, with measured import-closure proof.
- [x] I3: Eligible cached conversation history appears immediately; authoritative
  refresh reconciles stable item IDs and preserves per-conversation drafts.
- [x] I4: Cached inputs/templates get request-specific envelopes; reusable rendered
  HTML requires complete compatible identity/rebinding proof, never old nonces.
- [x] I5: Paging advances only from completed pages and actual server cursors;
  incomplete streams cannot invent completion/cursors or duplicate items.
- [ ] I6: Feature-off production output excludes feature-specific eager HTML/JS/CSS.

### Actions and server calls

- [x] A1: Trusted final `ServerCallContext` is erased from browser args/types and
  injected by the server for both remote RPC and in-process SSR calls.
- [x] A2: Browser cancellation options are local only; each call reauthorizes
  before private work/bytes. Trusted context is immutable and member-specific.
- [x] A3: Action-like GET parameters dispatch no write. An authenticated POST
  failing CSRF validation dispatches nothing; an accepted POST dispatches once
  outside speculative rendering, with receipt-only navigation/hydration afterward.
- [x] A4: Optimistic overlays pin owner/selection/operation ID; concurrent rejection
  removes only its overlay, and confirmation reads authority without self-confirming.
- [x] A4a: With authoritative revision comparison, receipts 2 → 1 settle both
  operations without rolling authority back from revision 2. Equal receipts settle
  without replacement; source refresh, selection changes, and retirement stay fenced.
- [x] A5: Ambiguous acknowledgement remains uncertain/identifiable and never
  automatically repeats a POST; host idempotency/receipt reconciliation is explicit.
- [x] A6: Leaving a view cancels its subscription, not accepted server work; server
  completion/timeouts/Stop and return-to-current-progress are tested separately.
- [x] A7: Compatible independent calls coalesce without slow-member barriers;
  per-member authorization/error/cancel/deadline/backpressure remain independent.
- [x] A8: Batches reject unresolved-Promise arguments and incompatible authority/
  endpoint/order policies; unrelated writes do not share an implicit transaction.

### Delivery evidence

- [x] V1: New public behavioral tests observed red against missing/broken behavior,
  then green; neighboring existing behavior covered in applicable modes.
- [x] V2: Executable end-to-end example covers SSR, early input, independent
  activation, navigation, cached/fresh history, actions, and batched calls.
- [ ] V3: Real Chromium/WebKit evidence for early typing/clearing/IME/focus,
  multiple early selections, slow code, interrupted streams, and hydration.
- [x] V4: 32 staggered thenables and deliberately large/aborted streams prove
  independent output, bounds, terminal settlement, and no unchanged CSS/head copying.
- [ ] V5: Comparable baseline/final production builds and traces record HTML,
  critical/eager/deferred JS/CSS, first useful output/input/click, result latency,
  server work, and relevant allocation/operation ratios. Report variance honestly.
- [x] V6: At runtime checkpoint `61e51dd8b`, public API types, authored exports,
  changesets, generators, and the applicable CI matrix pass. Documentation-only
  follow-ups require their own current-head checks.
- [x] V7: Two-pass independent review and adversarial self-review findings resolved;
  final candidate rerun after fixes, with remaining risk explicitly documented.
- [x] V8: Runtime checkpoint `61e51dd8b` is published in PR #1069 with agent
  provenance, committed sync output, and passing CI. This records that exact
  checkpoint, not a merge, release, or result for later commits.
