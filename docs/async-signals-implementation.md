# Async signals implementation and acceptance

This is the implementation ledger for [the accepted RFC](./async-signals-streaming-ssr.md).
An unchecked item is not complete. Passing a focused test does not establish the
whole feature; final evidence must cover its public integration path.

Current status: the author API, direct bindings, initial streaming/adoption,
independent activation, server calls/actions, later-fetched conversation
HTML/cache refresh, URL-action adoption, and the executable paging example are
implemented and locally verified. Follow-up verification also covers retired
async producers and direct-binding historical-to-live handoff. Native IME/BFCache,
Chromium, feature-off shared support cost, complete mobile/application performance
evidence, and publication/CI remain separate open gates. The evidence
log below is chronological: earlier setup blockers do not override later results.

### Renderer-free host follow-up (2026-09-12, locally verified)

The accepted contract now explicitly includes behavior-only, server-owned HTML
hosts without introducing a client renderer dependency. The initial audit found
that the low-level engine export was renderer-free but compiled global-signal
activation and automatic streamed/document bootstrap resolved `runtime.ts`.
Standalone tree-shaking removed most renderer code; that did not establish a
safe split-build boundary. It also found that implicit document cells did not
consume initial SSR values before ordinary behavior reads.

The follow-up extracts shared document ownership, adds initial-only seed adoption,
exposes host-controlled early script emission, and supplies native control binding
without reconciliation. The inline mailbox is not itself the live reactive
engine: eager derivations/async behavior must explicitly account for renderer-free
engine delivery. Lightweight-web remains read-only; this is framework support and
a representative fixture, not evidence that an application migration is deployed.

- [x] H1: Actual compiled global signal/derived/query consumers and automatic
  stream/lifecycle bootstrap resolve no client or server renderer modules.
- [x] H2: Initial SSR document state is readable before any root; early edits win;
  duplicate/late initial seeds fail and historical instance frames stay separate.
- [x] H3: Host-controlled CSP-nonced capture precedes interactive markup; fragment
  rendering omits duplicate bootstrap; ordinary automatic emission still works.
- [x] H4: Native controls bind, update derivations and dispose without a renderer,
  preserving original nodes and readonly capability, with native IME proof separate.
- [x] H5: Production split behavior-only workload verifies early input and shared
  auth-dependent body/history streams, no duplicate initial fetch, and zero
  renderer delivery before/after activation; emitted bytes and browser timing are
  reported independently of the existing native-island benchmark.

The final focused/neighboring run passes 944 existing-case executions across 71
project-files, with no new Vitest cases. Actual source, public typetests and the
authored behavior fixture typecheck; scoped formatting and `pnpm sync` pass.
All nine export builds pass their boundaries with unchanged consumed sources.
The final production WebKit workload passes three warmups and nine measured
flows: eager behavior before auth/EOF, held external modules, and pristine draft
restoration. It fetches two eager JS files and one optional controller, with no
renderer inputs, duplicate browser loader, or second copy of state. This is not
an application migration or a native iOS/IME/BFCache result.

Installed desktop Safari 26.6.2 also passes all three modes against the same
final build, including trusted early typing/clearing, original node/focus and
backward selection preservation, three day actions, and the complete shared-auth
streams. The native run is correctness evidence, not a latency measurement or
a fresh iOS result; all owned drivers and servers were stopped.

Two-pass review and the real fixture exposed genuine regressions before repair:
inline edits lost their revision at module handoff; an already-created query
rejected its opening frame while its auth dependency was pending; and completed
deferred results were lost on freeze or incorrectly reused after a changed key.
The fixes preserve the existing edit clock, bounded receiver mailbox and scope
retention. Completed data is not published until its exact request is selected;
unfinished ingress still expires. Independent final review found no remaining
actionable issue in these changes.

Final reports are `renderer-free-final-retention.json` in the tooling directory
below, and `renderer-free-bundles-retention-final-20260912.json` plus
`behavior-only-webkit-retention-final-20260912/{build,browser}.json` under
`/Users/callie/code/playwright-runs/`. The
[performance follow-up](./async-signals-performance.md) separates inline capture,
renderer-free live behavior, and the still-open application performance gates.

### Derived-state correctness recheck (2026-09-12)

An independent two-pass review found and confirmed two gaps in the accepted
derived-signal contract: a synchronous facade could classify a pending dependency
as an error, and an async projection could report completion while its dependency
stream remained open. The fixes reuse the graph's suspension and activity rules;
attempt validity, retirement, and producer completion remain distinct.

Four existing scenarios were strengthened, without adding test cases. The two
original regressions failed in development, production, and Strong mode (six
failures); the final focused and neighboring run passes 227 checks across seven
file/project executions. The actual Octane source typecheck and scoped formatting
pass with the approved source-built TSRX runtime 0.1.7. Independent final-diff
review found no further actionable issue. This is not a new broad-repository or
CI result, and no performance improvement is claimed for these correctness fixes.

Local red/green reports are under
`/Users/callie/.codex/octane-sync-tooling.DQfN9e/`, in
`signals-unified-red.json` and `signals-final-green.json` respectively. The older
temporary performance artifacts are no longer available; the
[performance follow-up](./async-signals-performance.md) distinguishes historical
claims from fresh measurements.

### Independent stylesheet recovery recheck (2026-09-12)

An independently confirmed application-host bug cached a rejected stylesheet
load permanently. A later interaction retried activation but reused that failed
promise, so the widget stayed inert even after connectivity recovered. Failed
loads now leave the cache, and only framework-created failed links are removed.
No automatic retry or document-owned stylesheet replacement was added.

The existing static/global registry scenarios now drive a controlled HTTP 500,
then a new requested load and HTTP 200. They fail before the fix because no
second request starts, then pass with the widget withheld until CSS loads,
both queued clicks preserved, and another widget reusing the successful load.
The neighboring run passes 51 checks; scoped typecheck and formatting pass.
Final independent source review found no actionable regression. Reports are
`stylesheet-recovery-red.json` and `stylesheet-nearby-green.json` under the
same durable tooling directory above. This is local generated-entry/hydration
evidence, not a native-browser interrupted-network test.

A distinct conditional gap remains: when an already-connected authored/SSR
stylesheet failed before the loader attached listeners, `sheet === null` cannot
distinguish failure from an in-progress load. This change does not replace that
document-owned link or claim recovery for that case. It is not evidence that a
Safari engine defect caused the failure.

### Previous broad local validation checkpoint

- Compiler: 57 files, 2,079 passing assertions.
- Final stable-source broad runtime: 17,079 passing assertions across 1,006
  dev/prod file runs; exactly the same 22 failures reproduced on the unchanged
  baseline, with no new failures or collection errors. Those baseline failures
  remain failures, not a green broad gate.
- Bundler/host build integration: 230 passing checks, two Chromium-only cases
  excluded. Rsbuild production artifacts execute with Node's native loader;
  local dev watching uses `WATCHPACK_POLLING=1000` after native watchers hit
  `EMFILE`. Normal dependency installation resolved missing harness packages.
- Document lifecycle/neighbor checks: 198 passing; generated bootstrap: 24 passing.
  Independent first-pass review reported no additional lifecycle findings.
- RPC/accepted-operation tests: 49 passing, including stable finite paging,
  authorization, and cancellation. App-core: 189 passing across 15 files.
- Actual package typecheck configurations pass for Octane, its public typetests,
  app-core, Vite, Rspack, Rsbuild, and the Cloudflare adapter. The unrelated
  workspace binding matrix is not included.
- Source-publication, wildcard TSRX, virtual TSX declarations, test markers,
  typecheck coverage, changeset, and computed release-plan guards pass. The
  publication guard retains its existing 101-item debt allowance; the virtual
  declaration guard examined 2,928 TSRX files. No allowance was added or changed.
- Final changed-file formatting and `pnpm sync` pass. Sync's relevant generated
  changes include the added entrypoint inventory and 21 eval grader digests
  derived from the root Vitest configuration change; no scoring policy changed.
- Both source-built production WebKit conversation scenarios pass after the
  lifecycle and fetched-history fixes. Chromium, OS IME, and native persisted
  BFCache remain unverified. Required current-head CI awaits publication.
- Final nested and nonnested production WebKit controls pass with parent/sibling
  modules unavailable: early input, original node/focus/selection, current derived
  DOM before another event, required CSS before reveal, and exactly one action.
  Feature-off optional widget delivery is excluded, but shared early-control and
  protocol support remains; I6's broader zero-feature-support-cost gate stays open.
- Both maintained async-retention modes pass 1,000 cycles with unresolved
  producers still externally held. Retired scopes, signal nodes, and iterators
  are no longer strongly reachable after the live positive control is retired.
- Matched production streaming-SSR ABBA runs pass all 24 correctness gates but
  show observed large-case overhead: CPU800 stream completion +8.7%, repeated
  waves +13.6%, and CPU800 shell +23.5%. Opaque member text conservatively enables
  signal ownership even without author-created signals. No safe narrow
  optimization was established; this is additional performance risk, not V5
  completion.

This checkpoint uses the approved source-built TSRX revision
`3ca1f0379fde7ea39d86e39ae92079c50fd18fc2`; it does not claim verification of
registry tarballs or a successful frozen workspace install. Source and lockfile
dependency pins remain unchanged. Later implementation changes require reruns.

## Baseline and scope

- Implementation branch: `dev/callie/async-signals-streaming-ssr`.
- Audited upstream baseline: `2789eab27ced3e2519cba4508b8e6aa9e728a3eb`.
- Prior clean detached revision: `cc6e5ea2273c418f96519d1b51cf61749cd97875`.
- Full integrated RFC, including global declarations, direct DOM bindings,
  progressive later-fetched SSR regions, independent activation, actions, and
  batched server calls. Not a prototype or a signals-only delivery.
- Excluded: Trusted Types implementation/enforcement tests, writable-derived
  overrides, unresolved-Promise RPC pipelining, merging, and deployment.
- Existing explicit scopes, native event semantics, Strong diagnostics, strict
  reads, initial pending, whole-result provenance, and hook semantics survive.

## Source ownership and implementation order

1. Signal engine: `packages/octane/src/signals/`, signal API tests and guide.
2. Compiler/bundlers: `packages/octane/src/compiler/` and Vite/Rspack/Rsbuild.
3. Renderer: client/server runtimes, early receiver, hydration, placement.
4. Server integration: `packages/app-core/`, RPC protocol/client/server, examples.
5. Integration, adversarial review, browser/performance proof, release notes, PR.

Cross-package interfaces are agreed before parallel edits. No shared mutable
request state, renderer dependency in signals-only imports, or parallel DOM
owners may be introduced to simplify integration.

## Observable contract and hot paths

Normal signal state reads/writes and ready synchronous derivations remain
immediate. Async attempt bookkeeping is paid by async work. Direct bindings
update their owned property rather than broadly rerendering components. Optional
widget code/CSS stays out of the eager closure when disabled. Baseline/candidate
measurements use identical fixtures, environment, warmup, and iteration policy.

Applicable modes: development and production compiler output; TSRX and TSX;
client mount/update/unmount; buffered and streamed SSR; initial/deferred hydration;
later region fetch; success/pending/error/abort; reentrancy and cleanup. Native
focus, selection, composition, parser ordering, paint, and module evaluation are
verified in real browsers, not inferred from jsdom.

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
- [x] D4: Typing and clearing update live signals immediately; stale storage/SSR
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
- [ ] V6: Public docs, API types, authored exports, and patch changesets updated;
  full applicable format/typecheck/test/generator checks pass.
- [x] V7: Two-pass independent review and adversarial self-review findings resolved;
  final candidate rerun after fixes, with remaining risk explicitly documented.
- [ ] V8: `pnpm sync` relevant generated changes committed; exact branch pushed;
  PR exists with agent provenance and honest validation. Current-head required/
  relevant CI is green before completion; no merge or deployment performed.

## Evidence log

- Initial worktree was clean. Branch created at the audited upstream revision.
- Runtime/compiler implementation is in progress. The focused evidence below
  does not establish the remaining integration and performance gates.
- Initial server-call foundation added: contextual export wrappers, trusted
  executor injection, request-local host adapter, per-invocation middleware, and
  production request-store setup. Compiler/dev/transport integration is still
  incomplete; A1/A2 are not checked off.
- Node 24.21.0 direct-source smoke passed concurrent async-context isolation,
  frozen capability records, rejection of spoofed context arguments, missing-owner
  failure, legacy arity, per-target middleware authorization, denial before body
  execution, and preservation of parent context. Removing the context-arity guard
  made the spoofed-context assertion fail; restoring it made the assertion pass.
  These smoke checks do not replace the pending public integration suites.
- Streamed RPC now has an opt-in, versioned per-invocation response path with
  incremental plain-data values, sequence validation, response-frame/total-byte
  budgets, a deadline, and demand-driven iterator pulls. The app-core adapter
  retains request context during later pulls and cleanup. Direct-source checks
  passed ready values, undefined/negative-zero preservation, independent fast and
  slow results, early iterator cleanup, concurrent consumer ordering, a response
  over 1 MiB, missing terminal, oversized frame, and deadline cases. Removing the
  sequence guard made the reordered-frame assertion fail; restoring it passed.
  Compiler-to-HTTP/browser integration, batching, and performance remain pending.
- RPC failures after dispatch are classified as uncertain unless the server
  confirms rejection before execution. No retry or durable receipt store is
  implied; operation identity and host reconciliation are separate work.
- The app-core request-owner carrier now installs the engine-free owner bridge,
  preserves a request through middleware and later response pulls, and fences
  callbacks after retirement. A dependency-free carrier smoke check passed
  concurrent request isolation, late pulls, retirement, and captured-callback
  rejection. Subsequent tests using the actual signal engine also passed
  concurrent request isolation, late pulls, and retired-callback fencing.
- Resource adoption uses a separate identity envelope from generic RPC results:
  protocol/build/document/owner/instance/node/selection/attempt/sequence. Content
  revisions are nonnegative safe integers, monotonic within the selected source;
  delta base revisions must match, while newer complete snapshots may jump.
  Opaque host cache tokens are not compared lexicographically as revisions.
- Full dependency installation is gated by Socket's recently-published policy for
  `@tsrx/prettier-plugin@0.3.138`. A formatter-only downgrade to available 0.3.131
  was authorized, but both normal and targeted pnpm lockfile regeneration could
  not resolve the unrelated pinned `@tsrx/typescript-plugin@^0.3.138` from the
  configured registry. Scoped-install resolution also could not find the pinned
  compiler `@tsrx/core@^0.1.71`. No registry/security override, compiler downgrade,
  or hand-edited lockfile was used; the original pins remain intact. Full Vitest,
  typecheck, formatter, production build, and browser evidence remain pending.
- A subsequent package-only frozen install successfully skipped re-resolution,
  but the offline store lacked required compiler artifacts and the normal online
  install was denied for `@tsrx/runtime@0.1.7`. A direct registry response confirmed
  Socket's recently-published policy. This establishes that downgrading only
  Prettier is insufficient. The installer is terminal and package/lock pins are
  unchanged; no alternative registry or blocked-package cache workaround was used.
- A separate temporary validation harness was installed normally through the
  configured Socket registry with npm, using approved TypeScript, Vitest, Vite,
  alien-signals, and devalue packages. It imports the authored candidate sources;
  it does not replace a pinned compiler/runtime or modify workspace manifests.
  The RPC, in-process authorization, and real-signal request-lifetime suites
  passed 28/28 tests. Disabling the context-arity guard made the spoofed-viewer
  test fail; restoring the guard made it pass. Focused strict TypeScript passed.
- The unified signal/lifetime suites initially passed 13/14 tests and exposed
  delayed obsolete-iterator cleanup. After fixing the stream cancellation
  boundary, the unchanged suite passed 14/14. Full workspace/compiler/browser
  checks remain separate and pending.
- Finite independent server calls now have an explicit synchronous collection
  scope. The batch re-enters the full HTTP authorization boundary per member and
  releases bounded one-shot results independently. Subscriptions remain on their
  own demand-driven transport; cancellation detaches a finite batched read and
  never aborts a sibling or retries the call. This is not durable-operation
  cancellation or an implicit mutation transaction.
- The expanded authored-source RPC/HTTP/host suite passed 40/40 tests after
  independent two-pass review. Both reviewers confirmed three lifecycle defects:
  headers were outside the deadline, nonsettling cancellation hid parser errors,
  and an outstanding iterator pull could publish after explicit return. All
  three new regressions were observed failing, then passing after focused fixes.
  The HTTP batch tests exercise per-target middleware, rejection before private
  work, independent result release, local cancellation, and 32 finite members.
- A bounded in-memory host fixture demonstrates accepted operation receipts,
  duplicate-ID reconciliation, subscription cancellation separate from accepted
  work, explicit Stop, timeout, and late-yield fencing. Its tests pass; it is not
  a production durable store or completed browser/URL-action integration.
- An approved isolated Prettier 3.9.6 installation with the authorized formatter
  plugin downgrade to 0.3.131 formatted root-owned source/tests using repository
  settings. Workspace package/lock pins are still unchanged. This is not the full
  pinned formatter/compiler/typecheck/sync gate.
- Expanded app-core TypeScript checking (the actual project config, with only
  dependency paths resolved through the isolated harness) exposed generic host
  return and async-context carrier typing defects. The host now preserves the
  awaited generic result, and synchronous signal entry rejects a provider that
  defers entry without later executing the rejected callback. The complete
  app-core source/types/tests TypeScript program passed; RPC/host tests now pass
  41/41. Compiler execution and repository-wide TSRX checking remain unavailable.
- Preliminary source-entry bundle comparison against the archived exact base
  first failed the feature-off guard because ordinary imports reached
  `signals/encoding.ts`. Moving the one shared codec to an engine-independent
  module (keeping its signals re-export) made the unchanged guard pass. The
  ordinary client/server Brotli deltas in that preliminary run were +390/+346
  bytes. This is source-entry cost, not compiled application, device, or final
  frozen-candidate evidence. Quick synchronous graph workloads passed semantic
  checks; timing samples overlapped a build and are not a performance claim.
- The broader approved-dependency app-core run passed 152/152 tests in 14 suites,
  including actual local HTTP handling, production assets/routing, configuration,
  code generation, request lifetimes, authorization and batching. Only the
  config-loader suite was excluded because it imports the blocked compiler.
  The overlapping focused RPC/host set passed 44/44; counts are not additive.
- A further independent two-pass batch review confirmed three defects. An outer
  rejection could hang while canceling its response body; an authoritative
  pre-invocation rejection became uncertain; and one member's envelope overhead
  could overflow the frame budget and fail siblings. All three probes failed
  before the fixes and the regressions now pass. Aggregate response-byte limits
  still terminate a batch when exhausted; individual overflow does not silently
  weaken that shared bound or retry a member.
- Added a compiled-author-API conversation fixture to the existing Vite test app,
  reusing the tested bounded operation host. Chromium/WebKit production scenarios
  are authored for blocked-parent independent activation, typing/clearing,
  node/focus retention, A→B→A drafts, and one accepted generation. They have not
  run. Automatic preflush/result producer integration, stable structural instance
  identity, storage candidate application and the remaining ledger still require
  implementation/integration evidence; the explicit host helpers alone do not
  establish the accepted automatic authoring contract.
- Public native-property typings now accept writable or readonly handles of the
  property's valid value type, including per-property styles and aliases/spreads.
  The new JSX type fixture first failed with 11 assignability errors, then passed
  together with the unchanged neighboring JSX fixture. Invalid payloads, event
  signals, and live handles in uncontrolled defaults still fail as expected.
- A related single-call HTTP regression was observed failing: an authoritative
  rejection remained pending while reading an unframed, nonterminating error
  body. The bounded result protocol now settles from HTTP status/outcome and
  initiates cleanup without awaiting it; legacy response parsing is unchanged.
  The focused RPC/host suite now passes 45/45. Current app-core and focused core
  strict TypeScript checks pass through the approved isolated dependency paths.
- Delivery now orders frames within each exact identity/channel instead of one
  global queue. Both inline and response regressions first failed because a
  style-blocked region prevented an independent sibling from appearing; they
  now pass. Pending frame count/bytes apply backpressure to response reads, while
  non-awaitable inline overflow fails only the affected selection. Composition
  waits remain inside the same bounds and cancellation lifetime.
- A missing result terminal now fails both attached and later-attaching signal
  consumers. A mailbox-overflow regression first showed an unaccepted terminal
  incorrectly replayed as success; budget checks now precede terminal acceptance.
  Completed results remain useful when subsequent HTML placement fails.
- Independent two-pass delivery review confirmed two further lifecycle defects:
  uninstall left an already accepted open result pending, and composition-deferred
  HTML could commit after uninstall. Four regression cases were observed red,
  then green. The verifier independently confirmed the fixes, including same-task
  cancellation, ordinary composition completion, completed-result preservation,
  and no disposal of unrelated/shared receiver ownership. Inline unfinished
  result count/deadline regressions also failed with their guards removed.
- A real WebKit 26.5 authored-source transport/DOM fixture reproduced the late
  composition-placement defect, then passed after the fix. Native typing,
  clearing, original textarea identity, focus, backward selection, stale-storage
  rejection, and result/sibling progress before a style gate passed. The
  composition events were synthetic: this is not OS IME, full compiler-to-browser
  hydration, production-bundle, or device-performance proof. Local traces,
  screenshots, and recordings were retained. Managed installed Chrome blocked
  remote debugging; bundled Chromium was not silently substituted.
- The focused renderer harness reached 46/46 passing tests with current early
  control and structural identity changes, and strict delivery TypeScript passed.
  These checks still do not establish automatic async producer/preflush wiring,
  full compiler execution, or the remaining unchecked acceptance gates above.
- Three browser-global owner regressions first failed with a missing-owner
  exception, then passed after adding a lazy document default. Global signals
  now work before any root and from ordinary Promise callbacks, share updates
  across roots, and survive root unmount. Explicit owners stay separate;
  an installed server carrier with no request cannot fall back to browser
  authority, and late writes cannot revive a retired document. The overlapping
  RPC/request-isolation suite remains 45/45 passing. The example again uses
  direct signal children as well as a writable control alias; compiled example
  validation is still pending.
- After the browser-default owner and SSR control-identity work, the isolated
  renderer harness passed 53/53 across seven suites. Focused core/delivery,
  app-core, and JSX strict TypeScript checks and root-owned scoped formatting
  passed. The temporary WebKit fixture server was stopped and its port verified
  closed. Full pinned compiler/build/sync/CI and PR publication remain outstanding.
- Independent discovery now watches later sidecars, consumes interactions made
  before metadata arrives, and retires removed widgets without retiring moves
  within its scope. Five lifecycle regressions were observed failing before
  their fixes, including a module import starting after its widget was removed
  during a stylesheet wait. Authored interaction-event filters are preserved.
- Independent two-pass review reproduced nested clicks importing the parent and
  giving it the child's intent. Independent wrappers now establish an early
  ownership boundary; ordinary parent-first routing, hydrated-parent pass-through,
  and permanently static parent behavior passed separate reviewer probes. The
  native enter-event guard is limited to documents with independent hydration;
  the ordinary-only probe performed no hit tests.
- A real WebKit 26.5 split-HTTP fixture exposed partial sidecar JSON becoming
  visible before its closing network chunk, and separate ancestor pointer-entry
  events importing the parent. Both failures were observed and fixed. The final
  fixture passed three native early clicks before metadata, real module import
  without parent/sibling evaluation, and removal cleanup. Screenshots, trace, and
  recording are retained in the local `octane-independent-nested-webkit-final`
  artifact directory. This uses authored runtime sources and real HTML parsing,
  not a compiled author application or a performance measurement. Its server
  was stopped and its port verified closed.
- Generated-entry execution now covers late widgets advertised by static entries
  or an existing Rspack registry. Both cases were red before the capability gate;
  feature-off controls failed under an unconditional-bootstrap mutation, then
  passed with the guard restored. Codegen/production-assets tests passed 25/25;
  the broader app-core review run passed 156/156. The actual Vite caller still
  needs to supply capability metadata; its later-first-widget integration is
  not established by these generator tests.
- The automatic producer and bootstrap have source-level evidence for exact
  server query identities, pre-module result delivery, and synchronous adoption
  without a second browser loader. Global pre-root reads must join the same
  document owner; instance-local reads retain structural ownership. Host/build
  metadata wiring and compiled author-app verification remain in progress.
- The current overlapping authored-source runs passed 102/102 renderer tests in
  ten suites, 231/231 signal tests in eight suites, and 45/45 RPC/host tests in
  five suites. Focused core, delivery, independent hydration, and JSX strict
  TypeScript passed. These totals overlap and are not full pinned-workspace,
  production-browser, performance, generator, or CI completion. Workspace
  package, lockfile, and runtime pins remain unchanged.
- At renderer handback, the expanded source harness passed 201/201 tests across
  thirteen files. The pinned-compiler-dependent streaming SSR suite remains
  excluded. Immediate pre-root global adoption was observed red without its
  document join, then green without a second loader. Query-free configured
  renders emit no query bootstrap; late query frames carry their own preceding
  announcement. The latter still needs a dedicated public post-shell regression.
  The streamed initializer lives at `octane/hydration/streamed-signals`, separate
  from the ordinary hydration barrel, and its authored module imports without a
  browser document in Node. Its package change adds only that export, not a
  dependency or runtime-version change.
- Remaining build integration must derive capability from a completed client
  build and compare SSR metadata against the executing client's own identity.
  A widget-only hash, the hardcoded Vite development ID, or copying authority
  from SSR JSON is insufficient. Vite's first-request resolver snapshot is also
  taken before page compilation; fix that ordering along with later-first-widget
  discovery. Buffered rendering still needs its seed/adoption integration rather
  than advertising a streamed mailbox it never emitted.
- Completed client-build metadata now reaches the generated client entry and
  Node/Worker hosts. The executing entry captures its own build ID before
  hydration, rejects mismatched server metadata before page evaluation, and
  passes the actual streamed bootstrap's owner to root and independent widgets.
  Missing required metadata files and JSON `null` fail clearly; optional legacy
  custom handlers remain supported. Generated-entry execution uses the actual
  signal producer/receiver and independent bootstrap, with renderer/import
  boundaries substituted. The broader app-core run passed 170/170 tests; the
  Cloudflare emitted-Worker/adapter run passed 9/9. These are not compiled TSRX
  application builds.
- Vite and Rsbuild now transfer completed client metadata before adapter
  finalization. Vite development capability discovery covers an initially empty
  widget catalog and refuses first stateful code discovered after ordinary HMR
  until a fresh build generation. Rspack uses its native build hash and a native
  runtime execution interceptor; ordinary feature-free HMR remains enabled.
  Independent review exposed deferred first execution after a completed hot
  update. Both initially known and newly added deferred-feature regressions were
  red, then green after tracking generation before feature execution. The host
  and native Rspack watch/HMR tests passed 12/12 using approved Rspack 2.2.2,
  within the repository's `^2.1.4` range. Compiler metadata tests and the full
  Vite transform path remain blocked on the pinned TSRX packages; this is not
  browser HMR proof.
- Buffered SSR now emits and adopts automatic query results using the same
  request/build/document identity as streaming SSR. Public source tests cover
  post-shell query announcements, pipeable output, and query-free output.
  Two-pass review reproduced injection-timeout rejection before rendering
  finished, cancellation during collection, a permanently suspended render
  ignoring the injection deadline, and throwing cleanup hooks masking the
  original failure. Regressions were observed red, then green; independent
  probes confirmed prompt settlement, preserved reasons, cleanup, and no
  uncaught or unhandled errors. The renderer source run passed 210/210 tests;
  focused renderer, app-core, and build-host TypeScript checks passed.
- A normal npm metadata check still cannot resolve the required core 0.1.71,
  runtime 0.1.7, TypeScript plugin 0.3.138, or formatter 0.3.138 from the managed
  registry. The visible older compiler/runtime are not substituted. Approved
  dependencies, including native Rspack, were installed only in the isolated
  validation harness; repository dependency pins and lockfile remain unchanged.
- A matched, repeatable authored-source bundle comparison against the preserved
  baseline measured Brotli bytes: ordinary client `createRoot` 44,354 → 46,188
  (+4.13%); synchronous SSR 12,057 → 13,251 (+9.90%); streaming SSR
  16,000 → 20,180 (+26.13%). The ordinary client excludes stream delivery,
  receiver, and independent bootstrap modules; signals-only imports remain
  renderer/DOM-free. Streaming SSR retains the automatic producer/protocol;
  synchronous SSR eliminates those modules. Identical repeated hashes and
  unchanged-input checks passed. These are retained-export source bundles, not
  final application bundles, runtime-speed measurements, or a cleared cost gate.
- The native HMR second-pass verifier independently reran all five cases and
  confirmed the deferred-execution fix, including a newly introduced runtime
  arriving during application of an update. No additional bounded finding
  remained; compiler discovery and browser HMR still need their own checks.
- `pnpm sync` was attempted, but the repository's dependency verification first
  launched installation and stopped at a 403 fetching `@tsrx/react-runtime@0.1.7`.
  The generator chain did not run; this is not a successful sync.
- At the user's explicit request and approval, exact upstream TSRX release
  source was copied into an isolated temporary checkout at commit
  `3ca1f0379fde7ea39d86e39ae92079c50fd18fc2`. It declares core 0.1.71,
  runtime 0.1.7, and TypeScript/Prettier plugins 0.3.138; the runtime subtree
  matches its release tag. A filtered frozen-lockfile install with lifecycle
  scripts disabled passed the managed supply-chain checks (1,163 entries), then
  the upstream TypeScript-plugin build succeeded with tsdown 0.22.0. Core,
  runtime, and Prettier ship authored sources and require no build. This gives
  matching-source compiler validation a supported local path without a runtime
  downgrade, registry override, or Octane pin/lockfile change. It does not prove
  identity with the published npm tarballs or complete the acceptance gates.
- Matching-source validation now executes the real native compiler and actual
  Vite client/server production builds. The focused compiler/hydration gate
  passed 233/233, and source-map/audit/module-server checks passed 192/192 after
  fixing generated-node locations and direct-binding source mappings. Browser
  context erasure passed the built upstream `tsrx-tsc`, including rejection of
  a forged viewer while preserving the server implementation's context type.
- Actual compiled application checks passed 12 non-browser production/dev
  cases, covering SSR, completed build identity, RPC authorization, and nonce
  handling. The first production build exposed a missing server export for
  `batchServerCalls`; its in-process facade now preserves callback results and
  ordinary per-call authorization/cancellation. Independent review and 15/15
  server-call/batch checks passed. Local calls do not acquire HTTP transport
  limits merely because the batch options validate.
- The compiled conversation WebKit run remains red: native input can be edited,
  but the deferred hydration entry waits for HTML EOF while the conversation
  subscription keeps the document stream open. A trace also exposed missing
  writable-control metadata in compiled textarea/select output; the compiler
  regression is now fixed and its 12-case matrix passes. This is not yet a
  passing browser integration or branded Safari/OS keyboard proof.
- Initial query selection authority now travels in the complete shell, before
  an early module can evaluate its query. The new no-duplicate-browser-fetch
  regression was observed red, then green; buffered and later-discovered query
  neighbors passed in the 11-case automatic stream suite. The broader actual
  compiler/renderer run passed 270/270. Independent review and early bootstrap
  placement are still in progress; the full workspace/CI gates remain open.
- Open-stream WebKit probes localized the bootstrap delay to module evaluation:
  an async module (including one without dependencies) waited for HTML EOF,
  while a classic nonce-bearing `import()` launcher evaluated before EOF under
  nonce-only CSP. The shared streaming host now uses that launcher for its
  separately identified module entry and the existing stream-cleanup marker.
  Explicit integrity, referrer policy, and credentialed fetch attributes fail
  clearly because the launcher cannot preserve those policies. The host suite
  passed 22/22. This establishes startup, not the complete conversation flow.
- Native Rsbuild production builds now validate that an early classic entry is
  self-contained and contains only the generated hydration entry. The default
  client/server build and separate user entry pass; explicit runtime splitting,
  initial vendor splitting, and merged user entry fail clearly. The neighboring
  build/host suites passed 19/19 without overriding consumer chunking choices.
- Real compiled hydration exposed two separate lifecycle mistakes hidden by
  hand-written renderer fixtures: subscribing through the public signal API
  during render, and publishing an early edit during render. An internal
  notification-only subscription bridge preserves the public write guard and
  does not evaluate dormant derivations. Independent probes verified owner
  restoration, invalidation, and disposal. Commit-time edit adoption and the
  expanded direct/spread browser-state matrix remain under validation.
- The compiler's scalar proof now preserves existing lean text/control output
  for proven primitive expressions while retaining capability checks for opaque
  values. The unchanged memo-off guard failed before the fix and passed after;
  two new scalar-control guards also failed under an isolated reversion. A
  matched compiled memo fixture returned to its exact baseline bundle size of
  11,185 bytes. Opaque controlled fixtures still have measurable retained-code
  growth; this is not a zero-cost claim or a cleared final performance gate.
  The current broad compiler run passed 2,053 tests with 14 expected-failure
  cases across 57 files (2,067 total).
- The approved source-built toolchain now completes `pnpm sync`, including
  package inventories, scaffold/consumer fixtures, corpus refresh, RuleSync, and
  agent-context budgets. The pnpm dependency convenience check was scoped to
  warning for this run; the registry security policy, dependency pins, and lock
  were unchanged. This does not establish registry-tarball identity or replace
  the remaining full workspace and CI checks.
- Actual compiled independent-parent coverage now passes 32/32 cases spanning
  dev/prod, parent-first/widget-first, inline/imported/local bodies, global
  direct signals, exact-target replay, and A→B→A draft switching. These probes
  exposed and fixed mismatched activation frames, local extraction metadata
  analysis, missing direct-read SSR seeds, adjacent signal text placement, and
  live rebinding incorrectly adopting the previous draft's DOM value.
- The pre-module independent intent mailbox is bounded and retains original
  event targets; stale targets are not replayed onto replacements. First-load
  Vite capability tests pass 4/4: feature-free pages omit the early launcher,
  while newly discovered independent widgets enable it. This is discrete FIFO
  delivery evidence, not yet latest-selection coalescing or trusted activation
  proof.
- The broad actual-source runtime run collected 1,000 dev/prod suites, with
  861 passing suites and 16,186 passing tests; 139 suites and 191 tests failed.
  This is not a green broad gate. Baseline comparisons separated outdated
  ad-hoc import evaluators from actual regressions. Affected evaluators now use
  the shared fixture loader without weakening their assertions. Restored
  property-evaluation order and hydration-suppression ordering pass the focused
  168-test dev/prod sample. Deep-tree SSR stack use and remaining failures are
  still under investigation.
- The WebKit conversation flow now preserves early typing/clearing, node and
  focus identity, one accepted send, and separate drafts across A→B→A. Its
  completed-turn assertion remains under validation. Two signal regressions
  reproduced stale initial-channel reuse after reselection and action receipt
  adoption canceling a live watch; both are fixed with the unified/stream/SSR
  source suites passing 65/65. The full browser flow must still be rerun.
- Repeated intermediate bundle measurements remained deterministic and showed
  measurable growth: gzip `createRoot` 50,695→53,157 bytes, synchronous SSR
  13,363→15,442, hydration/capture 66,499→69,450, streaming SSR 17,716→23,595.
  Ordinary client bundles still exclude the stream-delivery and independent
  bootstrap modules. Later correctness fixes require fresh final measurements;
  these numbers are not final-head costs, timing evidence, or a cleared gate.
- The full compiled WebKit conversation rerun now passes: early typing and
  clearing, independent activation, original textarea/focus preservation,
  A→B→A drafts, the completed server answer, one send POST, and receipt
  reconciliation through a single batch. This used the source-built Vite client
  and server under nonce CSP; it is not Chromium, branded Safari, or OS IME
  proof. Independent signal review also passed future-registration and stale
  frame probes, with 115/115 unified/async/stream tests passing.
- Broader regression follow-up restored initial sibling-text adoption and
  scalar→signal→scalar transitions without inferring only-child placement from
  a DOM node's type. The new transition matrix failed before the fix; all 162
  direct-binding dev/prod cases now pass. The two affected hydration conformance
  files pass 850/850. Aliased compiler-import and style-value tests now inspect
  AST argument semantics while retaining their mounted DOM/CSS assertions;
  342/342 pass, with alias/value-removal sensitivity checked independently.
- Full compiler coverage passes 57 files: 2,053 passing and 14 existing expected
  failures. The source-built TypeScript checker now passes the actual package
  configurations for Octane, its public typetests, app-core, Vite, Rspack,
  Rsbuild, and the Cloudflare adapter. Missing validation-only dependencies were
  installed normally with lifecycle scripts disabled and linked locally; no
  package pins or repository lockfile were changed. The entire workspace's
  unrelated binding/typecheck matrix has not been run.
- A 32-query reverse-settlement test now proves each late sibling's HTML reaches
  the response before earlier queries settle, with all result values and terminal
  frames delivered. A head-of-line-blocking mutation made it fail; the restored
  implementation and >1 MiB/bounds/abort delivery neighbors pass 35/35. This is
  stream behavior evidence, not browser paint, CSS-copying, or latency proof.
- Independent two-pass review confirmed and resolved early unfinished-result
  deadlines, selection-pinned optimistic confirmation, and explicit uncertain
  operation reconciliation. Selection deadlines now start at registration and
  survive module attachment; open/missing/complete delivery controls pass in
  both compile modes. Retained uncertain operations can adopt a matching
  authoritative receipt or reject only their own overlay, without another POST.
  Supersession, A→B→A, owner retirement, forbidden writes during pure reads, and
  definitive-response cleanup are covered; the unified suite passes 50/50.
  BFCache lifecycle wiring remains in progress and is not cleared by the normal
  conversation flow.
- Compiler review closed keyed overload, conditional-await merge, expression-body,
  and unsafe local-helper inlining gaps. New tests were observed red (stale or
  wrong-owner values, or silently discarded argument evaluation); the fixed
  compiler preserves attempt invalidation and diagnoses unsupported helper
  signatures instead of dropping effects. The complete compiler suite now has
  57 passing files and 2,079 passing assertions, including existing expected
  failures. Applicable package and public API typechecks remain green.
- Explicit selection intent coalescing passes compiled parent/independent-widget
  controls. A second replay check also rejects a queued selection whose exact
  control/group changed during an earlier discrete action; the compiled
  mutation scenario was observed red before the fix. This does not add eager
  handler execution or claim native trusted-activation timing.
- The existing 1,000-level SSR regression was observed failing in all eight
  dev/prod cases, then passing after restoring direct synchronous component
  invocation and moving context restoration data off the recursive stack. The
  complete Fizz suite passes 60/60. Nested owner return/throw, real
  AsyncLocalStorage carrier, and query-observer neighbors pass 21/21; removing
  synchronous owner restoration in an isolated fault projection fails both
  applicable new cases. This adds one fixed-shape context envelope per framed
  component. The descriptor throughput measurement below records its current
  cost; complete final entrypoint bundle measurements remain pending.
  A separate actual-source 1,000-level readable-stream probe still fails with
  an installed owner carrier, automatic streamed-signal observation, or both
  (six dev/prod failures; the two plain-owner controls pass). Those required
  carrier/observer wrappers remain intact. This is a measured residual depth
  limit, not a passed optional-mode gate or a blanket deep-SSR claim.

## Scaled wire-payload evidence

A separate source-backed compiled fixture compares one region with 32 regions
resolved in reverse order. It has nonempty shared scoped CSS and static title/meta
content. The decoder verifies every resulting paragraph, index, scoped class,
signal value, and terminal frame; unresolved predecessors remain absent at each
step. Shared CSS and head content each occur once across the complete raw wire,
including encoded carriers, with no copies in subsequent completion waves.

| Regions | Total wire bytes | Shell bytes | Shared CSS bytes | Shared head bytes |
| --- | --- | --- | --- | --- |
| 1 | 5,364 | 3,863 | 107 once | 83 once |
| 32 | 78,941 | 30,387 | 107 once | 83 once |

An isolated fault projection that repeats emitted CSS/head fails both controls:
the corresponding raw contents occur two times for one region and 33 times for
32 regions. The restored source passes both. This supplements the maintained
32-query and >1 MiB/bounds/abort regressions; it is a manual scaled wire audit,
not a browser-paint or latency benchmark.

## Current SSR performance evidence

An independent measurement used the unchanged `ssr-throughput/nested-work.mjs`
worker with frozen baseline `2789eab` and candidate production artifacts, Node
24.21.0, Darwin 25.6.0, Apple M5 Max, Vite 8.1.5, and esbuild 0.28.1. Each fresh
process warmed for 350 ms and measured each mode for two seconds. In the final
A–B–B–A run, team builds/tests were paused; unrelated machine contention was
not independently excluded. Ranges are the two per-process medians, not
confidence intervals:

| 1,001-row descriptor mode | Baseline median range, ms | Candidate median range, ms |
| --- | --- | --- |
| Nested | 1.927–2.014 | 1.952–1.990 |
| Flat | 1.629–1.692 | 1.644–1.655 |
| Fully explicit-keyed | 2.079–2.179 | 2.239–2.245 |

Nested and flat ranges overlap. Explicit-keyed traversal shows an observed
5.3% slowdown by center of the run medians; earlier contention-affected runs
also showed about 5%. CPU profiles did not isolate a justified small fix, so
no speculative optimization was landed. This remains a performance risk.

All modes preserve row identity/order and byte-identical HTML/CSS, with combined
response SHA `a88626f3f1917242e578e43611410e6aa8f542365572844f68286f72d8e10534`.
Existing key-serialization work is unchanged; an untimed observer sees one
additional JSON serialization per render, not per component. These are source
call counts, not heap allocation measurements. The complete fixture bundle
grows from 60,015 to 68,464 raw bytes and 20,417 to 23,398 gzip bytes. This is a
descriptor fixture, not a full conversation app or a browser-latency result.
The measured candidate bundle SHA is
`c30743d42e2391258ace36b3a253cc67be6b0f51f1de4a66b1fafb7104225354`; subsequent
source edits require a freshness check before treating it as final evidence.
The final placement-helper export changed the source import closure. An isolated
current-source rebuild then reproduced that exact bundle byte-for-byte and all
three 1,001-row HTML/CSS controls. Thus the frozen timing evidence applies to the
current emitted workload without inferring tree-shaking from source alone. The
freshness record is `nested-ssr-current.jSfZK1/freshness.json` under the local
verification artifact directory; no additional timing claim was made.
After the async-retirement and historical-handoff fixes, another repository-owned
`nested-work.mjs 0 --build-only` rebuild reproduced the same SHA, raw/gzip sizes,
and all three untimed HTML/CSS/call-count controls. The previously measured
workload is still byte-identical; no new timing run or improvement is claimed.

### Final source-entrypoint size checkpoint

Two repeated baseline/candidate builds on September 12 used the same source-built
TSRX revision, Node 24.21.0, esbuild 0.28.1, minification, and compression policy.
All four authored/compiled runs exited successfully and the recorded source tree
was unchanged during measurement. These are isolated entrypoint closures, not
incremental chunks that can be added together or full application delivery sizes.

| Entrypoint | Baseline gzip bytes | Candidate gzip bytes |
| --- | --- | --- |
| Ordinary client root | 50,695 | 53,205 |
| Synchronous SSR | 13,363 | 15,707 |
| Query engine | 9,669 | 13,801 |
| Hydration root | 66,499 | 69,892 |
| Streaming SSR | 17,716 | 23,867 |
| Hydration strategies | 2,469 | 3,893 |

New optional entrypoint closures measure 5,023 gzip bytes for independent
hydration, 21,478 for streamed hydration, and 15,738 for the signal facade.
The compiler's feature-disabled memo control remains byte-identical at 429
minified module bytes and 11,185 bundled bytes. Unchanged scalar-controlled
emission also remains byte-identical; its runtime closure still grows. Direct
handle recognition and owner support therefore have a measured shared cost;
this is not a claim that every feature-off app is byte-neutral.

Provenance is recorded in
`final-costs-2026-09-12T08-05-24-094Z-provenance.json` under the local verification
artifact directory. The candidate source hash is
`1e261d09f7da5a089b4560ef94713e4ace982daa57e3a80b5eaefa7533ee5d9e`.
These measurements do not establish mobile first-click latency, paint timing,
memory retention, or the complete application's eager/deferred delivery budget.

### R9 document lifecycle implementation checkpoint

- The optional `octane/hydration/streamed-signals` entry now exports
  `installSignalDocumentLifecycle`. App-core installs it automatically for an
  SSR signal mailbox or completed independent-hydration capability, capturing
  the same document owner and executing build/document IDs. Feature-free
  generated entries still perform no optional lifecycle imports.
- Persisted exit marks all existing document/instance scopes before invoking
  producer cancellation, revokes pending query and derived attempts, and closes
  old frame ingress. Completed values, including pre-activation completed
  results, writable drafts, and uncertain optimistic operations remain intact.
  Not-yet-entered independent activations pause; active island DOM is not
  unmounted. Compatible restoration restarts only still-selected unfinished
  reads once and resumes pending island activation. It never retries mutations.
- Restore validates current document metadata against the captured executing
  build/document IDs and original live owner. Mismatch retires/reloads; ordinary
  exit retires/disposes. This is not an account manager or a server deployment
  lookup. Hosts still own account authority changes and later RPC authorization.
- Automatic coverage intentionally excludes client-only signal routes with no
  SSR mailbox or independent capability. Custom hosts can explicitly install
  this helper with matching metadata; no new runtime-to-host loader hook was
  added to ordinary routes.
- Actual source-backed dev/prod tests first recorded 12 missing-lifecycle
  failures with two completed-data controls. A current test-only fault removing
  the pagehide subscription produced 24 failures and four unchanged-data
  controls. A further completed-result-before-first-descriptor case failed in
  both modes before selective completed-result retention was implemented.
  The latest focused lifecycle, independent/early intent, automatic stream,
  document owner, and unified signals/action run passed 198/198; generated
  app-core bootstrap integration passed 24/24. The lifecycle and renderer
  scoped source-backed typechecks also passed. These are local source checks,
  not registry-tarball, CI, or native BFCache acceptance.
- The approved native WebKit 26.5 A→B→Back mechanism probe did **not** enter
  BFCache: it created a new JavaScript instance and emitted
  `pageshow.persisted=false`. History restored the input value without restoring
  the old JS instance. Native persisted-restoration proof therefore remains
  unavailable in this environment; synthetic page lifecycle events are not
  substituted for that evidence. Artifacts:
  `/Users/callie/code/playwright-runs/octane-bfcache-mechanism/result.json` and
  `/private/tmp/octane-signal-validation.aX019a/document-lifecycle-final-neighbors.json`.
- Cost is feature-local lifecycle registration plus optional freeze-time scope
  scans/barriers. Query starts and async-derived attempt validity check the
  owner's optional barrier; each derived binding stores one frozen flag. No
  render/node loop was added. Final bundle accounting must include this new
  checkpoint; no throughput improvement is claimed.

## Final later-fetched history integration

The separate `/conversation-history` production route now emits actual compiled
SSR snapshots, not hand-authored stand-in HTML. The optional
`createStreamedRegionPlacementFrame` server helper packages the renderer's exact
native historical seed, scoped CSS, and completed-build stylesheet identities.
Every response reauthorizes and validates its executing build. Its bounded
viewer/conversation cache holds input data only; a new document/selection always
gets freshly rendered HTML and a new ownership envelope.

The URL action is accepted in route middleware before rendering. Neither
hydration nor refresh submits it again. The browser keeps drafts/selection in
the document owner, separately from the region's advanced explicit Scope.
Dormant placement waits for styles and leases the historical frame; activation
removes only receiver-owned outer anchors and hydrates the original component
output. Thereafter result values update the active renderer while HTML
placements are rejected. Finite RPC pages use real server cursors, deduplicate
stable IDs, and retain already-loaded older rows during newer watch updates.

Independent review and deliberately broken controls found and corrected these
observable races:

- A watch update discarded a completed older page/cursor. The controller now
  preserves loaded IDs and applies authoritative updates to those known rows.
- Custom fetch/region ownership escaped document freeze. Explicit lifecycle
  handling now cancels and fences old transport and resumes only selected
  unfinished reads; duplicate persisted events cannot start two resumes.
- Ignoring an older cached result did not stop its HTML replacing retained DOM.
  Restoration now has separate floors for live data and actually presented HTML.
  A newer model waiting on CSS is not mistaken for already presented content.
- A result terminal arrived before required-CSS placement finished. Completion
  now follows successful response/placement drain, so restoration restarts an
  unfinished reveal even when its data channel had completed.

The original merge/lifecycle projections failed four checks; duplicate restore
failed two; stale-placement and CSS-blocked completion projections failed four.
Restored source passed 82 focused dev/prod tests, followed by a final 112-test
controller/region/lifecycle/receiver/delivery neighbor run. An independent final
review reran all eight controller cases with no hydration diagnostics and no
remaining findings. Actual TSRX typechecking includes both new tests and the
complete fixture, without declaration stubs or repository config exceptions.

The final rebuilt production WebKit pair passes 2/2: early typing/clear and
independent activation while parent code is blocked, plus cached/fresh fetched
SSR, A→B→A drafts, URL receipt adoption, unchanged article identity through
activation/refresh, completed-page IDs, and no duplicate mutation. These are
browser-flow checks, not native persisted BFCache, OS IME, or mobile latency
proof. Local reports are `webkit-publication.json`,
`fetched-publication-final.json`, and `fetched-history-final-neighbors.json`.

## Async retirement and historical handoff follow-up

Final diagnostics against committed implementation `f1262f3e3` exposed three
additional defects. These fixes preserve the public API and live direct-binding
fast path; they do not add a new ownership or event layer.

- A query attempt retained its original stream iterable through `result` even
  after clearing its iterator field. Retired attempts now release that result;
  stream observations continue through the existing mirror. The unchanged query
  diagnostic retained 1,001 iterators before the fix and zero after retirement
  with the fix. The selected upstream baseline also passed this control.
- Unified async derivation callbacks and explicit pending reads retained their
  binding/owner through unresolved producers. Callback closures now use a
  revocable attempt reference, and a lazily allocated read-cancellation promise
  settles local reads on retirement without canceling a foreign producer.
  Context cancellation and iterator cleanup remain observable. The maintained
  public `derived$` diagnostic retained 2,001 disposed scopes before the fix and
  zero afterward. Separate foreign-pending-read and retained-completed-context
  probes confirm those references no longer keep retired owners alive.
- A direct binding adopted historical HTML but missed historical-lease release.
  With a newer early draft already in the live cell, its derived DOM could stay
  stale until another event. Historical direct reads now register the existing
  lease-release witness; ordinary live reads retain targeted subscriptions.
  Four strengthened compiled root/island dev/prod cases fail against the original
  graph and pass with the fix. They verify direct text and attribute handles,
  historical-before-activation/current-after-activation values, and original
  input/output nodes, focus, and selection without a render-time `.get()` masking
  the missing witness. The owning and neighboring checks pass 394/394.

The maintained retention runner now accepts `--api=derived`; its default query
mode, unresolved promise/stream workload, collection policy, positive controls,
and strong-edge scanner remain comparable. The same derived runner/worker/scanner
was observed red on the archived committed sources and green on the candidate.
Both final modes pass 1,000 cycles, with 3,003 external producer promises still
held when all scopes, signal nodes, and stream iterators have been released.
This is Node data-owner/async-retirement evidence, not DOM, browser, historical
frame, or DevTools retention proof. Raw heaps remain local.

```bash
node benchmarks/scoped-signals/run-async-retention.mjs --cycles=1000
node benchmarks/scoped-signals/run-async-retention.mjs --api=derived --cycles=1000
```

Local runs use the documented explicit `--tooling-root` source-backed harness.
Final reports under `/private/tmp/octane-signal-validation.aX019a` are
`retention-query-final-head.json`, `retention-derived-final-head.json`, and
`runtime-retention-handoff-final.json`. The broad rerun has 17,079 passing
assertions and the exact same 22 baseline failures, with no new failures or
collection errors. Actual Octane and compiled fixture typechecks pass.
Two sequential reviewers who did not author the follow-up changes reported no
actionable findings. The second pass independently checked callback/dependency
lifetimes, historical release, current input hashes in both retention reports,
and the unchanged broad failure set; the first also reran 76 focused dev/prod
cases and the strict production browser flows.

## Nested independent production delivery proof

Final actual Vite/Octane production builds use the pinned source-built TSRX and
unchanged fingerprints for 198 product source files. Strict nested and nonnested
WebKit 26.5 flows both pass: App, Parent, and Sibling emitted modules are held
unavailable while the target activates. Scoped and external CSS are ready in
the activation effect, before reveal. Native early typing retains the original
textarea, focus, and selection, and its derived character count is current
before any subsequent input. The target action executes once, the sibling never
executes, and page/console errors remain empty. This closes I2, not mobile latency
or branded Safari/IME acceptance.

Physical production file accounting records these closures (gzip sums compress
each physical file independently; overlapping closures are not additive):

| Closure | Files | Raw bytes | Gzip bytes |
| --- | --- | --- | --- |
| Feature-off eager JavaScript | 5 | 231,484 | 73,812 |
| Feature-on initial HTML-referenced JS/CSS | 7 | 266,995 | 84,986 |
| Target static activation JS/CSS | 6 | 314,375 | 98,093 |
| Target increment over initial HTML-referenced closure | 3 | 56,420 | 16,998 |

The off response is 850 HTML bytes with no widget markup or CSS; actual browser
requests match its five-file closure. Target/parent/sibling, independent-island,
stream receiver/delivery, and document-lifecycle modules are absent. However,
shared early-values/global control publication and marker/protocol support are
still present and fully charged above. Optional-delivery exclusion is proven;
the broader I6 requirement of no feature-specific eager support cost remains
open. Automatic bootstrap dependencies are not attributed as target-only code.

The full source/input hashes, retained production outputs, physical file/module
accounting, browser assertions, and trace locations are recorded in
`i2i6-production/VERIFICATION.md`, `delivery-accounting.json`,
`browser-result.json`, and `browser-flat-result.json` under the local verification
directory. The source manifest SHA is
`5c3e395258ab611d99f0798e4ac7c7cb70db19620d0f76b38bd25bc9e95b59b3`;
there was no product-source drift during or after the final builds. Temporary
servers were stopped. These are delivery/behavior checks, not throughput or
paint measurements.

## Final common streaming-SSR cost

The unchanged `benchmarks/streaming-ssr` page and runner compare audited base
`2789eab27` with product commit `044050f57`. Actual production Vite 8.1.5 builds
use the same approved TSRX sources, esbuild 0.28.1, Node 24.21.0, Darwin 25.6.0,
and Apple M5 Max. All ten fixture/runner/statistics/gate/config inputs are
byte-identical between commits; 68 baseline and 88 candidate loaded product,
compiler, and manifest inputs match their exact Git blobs. Sources and bundles
remain unchanged across the four fresh A–B–B–A timing processes. Task builds/tests
were idle; unrelated machine contention was not independently excluded.

Each of six scenarios has five warmup renders and 150 timed renders per process.
All 24 existing correctness gates pass. An untimed supplementary check matches
every card payload, five spec rows per card, header/footer/hero, grid, and slot.
The timed runner and statistics are unmodified; a common sidecar captures raw
samples after each scenario and writes them at exit, outside measured renders.
The score is the existing selected late-window mean, not the median. These are
ranges of two per-process scores, not confidence intervals:

| Stream completion | Base score range, ms | Candidate score range, ms | Midpoint change |
| --- | --- | --- | --- |
| CPU10 | 0.191–0.193 | 0.190–0.205 | Overlapping; inconclusive |
| CPU100 | 1.077–1.134 | 1.154–1.259 | +9.2% |
| CPU800 | 8.630–9.031 | 9.563–9.637 | +8.7% |
| Reverse waves of five, 50 cards | 1.776–1.801 | 2.018–2.044 | +13.6% |

CPU800 shell score is 1.769–1.830 ms versus 2.218–2.227 ms, an observed +23.5%
midpoint change. The all-fast completion ranges overlap; the staggered case is
dominated by its deliberate 50 ms data schedule. Neither establishes a speedup.
Complete scores, medians, selected windows, raw samples, and variation are retained.

This page uses `use(Promise)`, not author-created `query$`/`derived$` or explicit
signal injection. Its opaque member text nevertheless lowers through
`ssrSignalValue`, conservatively enabling ownership so real aliased handles remain
supported. It is therefore not a proven signal-capability-off workload. Bounded
separate profiles identify owner lookup/path serialization among material costs,
alongside framing, serialization, and GC. Sample percentages do not attribute the
entire slowdown or prove a safe optimization. Removing ownership without stronger
primitive proof could change identity semantics, so no speculative patch was made.

Both untimed variants emit equal raw wire lengths: 20,863 bytes for ten cards,
180,893 for 100, 1,431,071 for 800, and 91,945 for 50 in waves. Timed-run framing
totals differ slightly from untimed captures but match between corresponding
variants. The server bundle grows from 81,441 raw / 27,673 gzip bytes to
89,424 / 30,276, using `gzipSync` defaults rather than the other checkpoint's
gzip-9 policy. Server bundle size is not browser delivery cost.

Artifacts are under the local verification directory's `streaming-cost-Pk8eUg/`:
`report.json`, `report.md`, `provenance-before.json`, `provenance-after.json`,
`observations-final.json`, timing commands/raw samples, and the separate
`profile-report.json`/`profile-notes.md`. This improves the server-work evidence
but does not establish application paint/input/token latency, mobile performance,
explicit signal-delivery overhead, frozen installation, or CI. V5 remains open.
An independent verifier recomputed all 48 score records from raw samples and
checked source/bundle fingerprints, semantic controls, wire counts, and profile
percentages without finding a material discrepancy.

## Application-shaped streaming benchmark follow-up

The maintained conversation benchmark, dependent-query transport repair, and
small measured SSR allocation-site reduction are documented in
[Async Signals performance follow-up](async-signals-performance.md). That later
checkpoint distinguishes full signal-stream completion and browser activation
from the ordinary `use(Promise)` workload above; it does not retroactively make
the older checkpoint a feature-off or application-latency measurement.
