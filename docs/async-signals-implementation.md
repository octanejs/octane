# Async signals: implementation and acceptance

This guide explains how the [accepted RFC](./async-signals-streaming-ssr.md)
maps to Octane's implementation. It separates supported behavior, implementation
choices, measured results, and unfinished acceptance work.

The runtime checkpoint is `61e51dd8b` in
[PR #1069](https://github.com/octanejs/octane/pull/1069).
Its [26-job CI run](https://github.com/octanejs/octane/actions/runs/34872980454)
and automated review passed. Those results do not establish every browser,
performance, or deployment requirement in the RFC.

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
| Fixed-tree authored bindings | The host owns structure and events; the adopter owns declared properties | `adoptBindings`, compiler-generated property updates, synchronous refresh, cleanup |

For hosts that also delegate streamed HTML placement to Octane,
`bootstrapStreamedSignalHydration` adds `receiver.registerRegion`.
Install either that bridge or the results-only bridge, not both for the same
document. Both use the same result identity and lifetime rules.

**Renderer-free does not mean JavaScript-free.** The inline
`earlySignalBootstrapScript()` captures edits and incoming data without importing
a renderer. Live reads, subscriptions, derivations, and async computations need
the renderer-free signal engine. A host that needs those behaviors before
interaction must deliver that engine and its handlers early.

**Fixed-tree adoption is not structural rendering.** The current
`'use dom bindings'` view supports a compiler-proven, element-only native tree
and declared attributes/classes/style properties. It does not support text
children (even static text), lists, child components, or direct `value`/`checked`
bindings. Use `bindSignalControl` for renderer-free controls. Use the native renderer for
component reconciliation, or keep streamed HTML placement with the host or
registered-region receiver. Receiving streamed data alone does not update a list.

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

The fixed-tree adopter does not yet provide renderer-free dynamic lists or
component rendering. The maintained behavior-only workload deliberately retains
historical server-owned lists while checking live streamed data. Do not use its
pass as evidence of structural list updates.

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
- [x] A3: URL action dispatches once outside speculative rendering while unrelated
  work proceeds; browser adopts its receipt without replaying the mutation.
- [x] A4: Optimistic overlays pin owner/selection/operation ID; concurrent rejection
  removes only its overlay, and confirmation reads authority without self-confirming.
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
