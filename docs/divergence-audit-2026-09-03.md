# September 2026 divergence audit

This records the disposition of the supplied React 19.2.7 behavioral audit
against Octane at `33720d8eff122280e52dc25748127cd9cc16ea65`. Regressions belong
to the owning compiler, runtime, or server implementation. Intentional language
and scheduling behavior is specified in
[Differences from React](./differences-from-react.md).

The new compiler, hook, server, event, host-update, root-container, and migration
tests cover observable DOM, identity, callbacks, and serialized output. Initial
focused runs reproduced 17 compiler failures, 16 hook assertions, 17 server
failures, and 13 event/portal failures before their respective fixes. Existing
tests that asserted global transition pending state, deferred public-unmount
cleanup, or rejected document heads now assert the corrected contracts.

## Compiler findings

The main evidence is
[compiler-authored-hosts.test.ts](../packages/octane/tests/compiler-authored-hosts.test.ts),
with the existing compiler, script/style, universal-renderer, and hydration suites.

| ID | Disposition |
| --- | --- |
| A1 | Fixed: mixed-child ternaries retain their authored sibling position. |
| A2–A3 | Fixed: template and server output use JSX whitespace rules and decode literal HTML entities once. |
| A4 | Preserved and documented: template children are opaque render bodies. `descriptorChildren` is a public opt-in for structural inspection; `isChildrenBlock` distinguishes a compiled body from a render prop. |
| A5 | Preserved and documented: template control-flow arms own separate scopes. Use one component with conditional props, or returned descriptors, when identity must survive the branch change. |
| A6–A7 | Fixed: component keys normalize to strings; keyed hosts outside a list use the existing keyed renderer and remount on a changed key. |
| A8 | Fixed: JSX nested in portal array, ternary, and logical-expression bodies lowers before emission. |
| A9 | Preserved and documented: script bodies are raw JavaScript source. Dynamic script content belongs in `children` or `dangerouslySetInnerHTML` props. Heuristically rejecting braces would reject valid JavaScript blocks. |
| A10 | Fixed: style elements with explicit content props remain ordinary hosts. Literal style bodies retain the scoped-CSS language. |
| A11 | Fixed: parser-sensitive client subtrees use imperative DOM construction, retaining authored content and development warnings. Browsers necessarily repair invalid serialized HTML before hydration. |
| A12 | Fixed: JSX Suspense is transparent to independent fetch and lazy-module warming. |
| A13 | Fixed: server memo factories receive dependency arguments like the client; the extension is documented. |
| A14 | Fixed: static property-backed booleans use property bindings. Hydration preserves a user's existing option selection. |
| A15 | Fixed: document/head/body hosts compile; metadata folds into an authored or implicit head. Document-root metadata uses its owning document. |
| A16 | Fixed: named template function expressions, including memo wrappers, use the normal client emitter. Supported plain-JavaScript try/return forms compile in both modes; discarded template output remains invalid syntax. |
| A17 | Fixed: stylesheets without precedence stay in place, including their listeners and hydration identity. |
| A18 | Fixed: noscript children mount through imperative DOM construction; mismatched hydration anchors recover without a detached-node insertion. |

## Runtime findings

Evidence:
[audit-hook-behavior.test.ts](../packages/octane/tests/audit-hook-behavior.test.ts),
[audit-events-portals.test.ts](../packages/octane/tests/audit-events-portals.test.ts),
and the existing action, transition, effect, reconciliation, and browser event suites.

Integration follow-ups cover repeated and awaited Actions interleaved with urgent
updates. State, reducers, and third-tuple getters replay those operations in
dispatch order. An urgent ancestor can publish new props and effects while a
child retains its committed inputs for a separate transition attempt. The
[descendant suspension controls](../packages/octane/tests/transition-descendant-suspend.test.ts)
and [urgent equality controls](../packages/octane/tests/transition-urgent-equality.test.ts)
cover retained DOM identity, independent pending indicators, urgent replacement,
functional replay, and late-promise cancellation.

| ID | Disposition |
| --- | --- |
| B1 | Fixed: each transition hook tracks its own action batches and suspended work. Unrelated transitions and deferred values do not flip its pending indicator. |
| B2 | Fixed: hook action failures route to their owner's boundary; module-level transition failures report globally. |
| B3 | Fixed: queued updaters/reducers observe render-time inputs and route failures through render boundaries. Transition updates retain that behavior. |
| B4 | Fixed: parent setup self-updates replay before initializing children or publishing effects; update-limit errors reach the owning boundary. Output entrypoints also discard inputs that schedule a self-update before that entrypoint runs. |
| B5 | Preserved and documented: passive effects normally run after paint, including discrete, store, and flushSync commits. Subscriptions needed at commit completion belong in layout effects. |
| B6 | Fixed: public root unmount drains passive work and cleanup synchronously. Ordinary reconciler deletion retains its passive phase. |
| B7 | Fixed: new keyed children mount in forward order while survivor placement retains the LIS algorithm. |
| B8 | Fixed: urgent resuspension ends a transition hold; external-store notifications remain urgent. |
| B9 | Fixed: deferred values and their visible bindings stage together while suspended, preserving stale-content indicators. |
| B10 | Fixed: memo, warming, and HMR metadata cannot activate copied behavior on a static-hoisting wrapper. DOM, server, and universal warm emitters share that ownership contract. |
| B11 | Fixed: string/number portal keys preserve identity during reordering. The component-props object overload remains documented. |
| B12 | Fixed: disabled native form controls suppress the applicable mouse-handler slots. |
| B13 | Fixed: each delegated phase snapshots handlers, including mutable compiler bundles. Form actions and submitters are captured before handlers and run afterward unless canceled. |
| B14 | Fixed: custom-element event names preserve case across direct, spread, and descriptor paths. |
| B15 | Fixed: finite passive update chains warn and finish; synchronous loops retain a hard guard and cross-component render chains use the appropriate limit. |
| B16 | Fixed: commit callback failures wait until sibling callbacks finish before boundary recovery. Ref/layout/mutation phase ordering remains Octane's documented ordering. |
| B17 | Preserved and documented: suspended primary DOM can stay connected but hidden, and visibility includes portal content. Native form submission and DOM queries still observe connected hidden hosts. |
| B18 | Fixed: focus handlers use native focusin/focusout. Nested-root capture order already matches the React oracle and now has coverage. Native keypress filtering and non-passive listeners remain documented differences. |

## API, DOM, and server findings

Evidence:
[compatibility-exports.test.ts](../packages/octane/tests/compatibility-exports.test.ts),
[public-types.test-d.tsx](../packages/octane/typetests/public-types.test-d.tsx),
[host-update-contract.test.ts](../packages/octane/tests/host-update-contract.test.ts),
[root-container-contract.test.ts](../packages/octane/tests/root-container-contract.test.ts),
and [server-renderable-contract.test.ts](../packages/octane/tests/server-renderable-contract.test.ts).

| ID | Disposition |
| --- | --- |
| C1 | Fixed: buffered, static, prerender, and streaming entries accept renderables and second-position options while retaining the function/props extension. |
| C2 | Fixed: StrictMode and batching pass-throughs, useFormState alias, and server/static version exports. Profiler remains a documented non-goal; Octane's profiling API is separate. |
| C3 | Fixed: Element, Document, DocumentFragment, and ShadowRoot containers work; document doctypes survive root cleanup. |
| C4 | Added the pinned `@octanejs/react-is` binding over Octane's actual brands, plus memo identity/displayName and lazy displayName metadata. React-only component predicates do not imply support for those component types. |
| C5 | Added React-named aliases for Octane renderables, functions, props, refs, context, hooks, host attributes, styles, and native events. Class-component and synthetic-event types remain outside Octane's model. |
| C6 | Preserved: refs are props; forwardRef/createRef and executing precompiled React JSX are documented non-goals. The JSX runtime entry remains type-only. |
| C7 | Fixed: IS_REACT_ACT_ENVIRONMENT is honored, with component-aware update warnings. Nested act draining retains Octane's scheduler behavior. |
| F1 | Fixed: removing an object style clears only authored keys, preserving externally added declarations. |
| F2 | Fixed: scale is unitless; cssFloat aliases float in compiler, client, and server styles. |
| F3 | Fixed: uncontrolled defaults update the reset baseline without overwriting live text or reselecting options. |
| F4 | Fixed: form actions coexist with submit handlers across updates, cancellation, and function/native transitions. Submitter overrides and action snapshots follow the dispatch contract. |
| F5 | Fixed: invalid ARIA values and nonnumeric rowSpan/start values are dropped; innerText/textContent are ignored. clsx-style classes, CSS strings, live textarea children, and marker spelling remain documented extensions. |
| G1 | Fixed: all renderer paths escape application string returns. Only branded serialized values bypass escaping; copied component metadata grants no such privilege. |
| G2 | Fixed: style text preserves CSS syntax and hardens closing style tokens. |
| G3 | Fixed: newline-eating hosts preserve a leading newline in descriptor and template-hole paths. |
| G4 | Fixed: JSX Suspense errors render the buffered fallback, notify onError, and mark the arm for client recovery. Explicit server @catch behavior remains supported. |
| G5 | Fixed: unhandled pending roots throw in synchronous renderers instead of returning truncated HTML. |
| G6 | Fixed: descriptor Promise children participate in the same usable/retry machinery as template holes. |
| G7 | Fixed: recognized text and surplus-node recoveries report through onRecoverableError, with shallow suppression and retained matched DOM. Shell failures destroy capable pipe destinations, including destinations attached after failure. Equivalent serialization differences, server-hook no-ops, portal placeholders, and bounded static hydration inspection remain documented. |

Apollo, Inertia, Tiptap, Formisch, and Spring enforce their React import boundary
on authored source and adapted type probes. These checks do not forbid React
references in transitive declarations: Octane's migration aliases and JSX types
use its declared `@types/react` dependency. Strict consumer typechecks remain
separate from the authored-import checks.

## Documentation and diagnostic findings

Area D's code-only behaviors are now covered by the divergence contract: opaque
children, callback arguments, portal props, branch identity, effect timing,
render-count differences, hidden DOM/portals, retained initial suspended state,
microtask scheduling, native input/listener behavior, commit ordering, server
extensions, compatibility aliases, native event types, and server versions.
The stale prerenderToNodeStream and passive-effect parity descriptions were
corrected. Behaviors fixed here are no longer described as intentional.

Area E adds focused diagnostics for list keys, dependency length changes,
invalid effect returns, insertion-effect updates, lifecycle flushSync calls,
uncached snapshots, action/optimistic dispatch context, cached-factory `use()`
reads, and act component names. Idle form status reports a null method on both
the client and server.
Native form and submitter actions supply action context before their queued
`useActionState` callback starts, so they do not emit the outside-action warning.
Direct async dispatch outside that context still warns. The added check is
development-only and adds no production code. Both Cartlane production and development
browser suites pass (five cases each).
The relevant tests are
[audit-list-diagnostics.test.ts](../packages/octane/tests/audit-list-diagnostics.test.ts)
and [audit-hook-diagnostics.test.ts](../packages/octane/tests/audit-hook-diagnostics.test.ts).
Warnings for supported iterable directives, native event names, conditional
hooks, or React-only component APIs would give incorrect migration guidance.
Exact React wording, owner stacks, and default caught-error console transcripts
remain outside the claimed diagnostic parity; the broader inventory is in
[the diagnostics plan](./react-diagnostics-plan.md).

## Performance and validation

The fixes keep optional work on its relevant paths: parser-sensitive and keyed
hosts use existing descriptor machinery, custom-event tables initialize lazily,
and successful commits allocate no error queue. Handler snapshots use reusable
dispatch storage; mutable bundles copy only when changed during dispatch.
Server template results gain a short-lived carrier object so text can never be
mistaken for serialized HTML. Function identity alone cannot provide that proof:
one compiled template can return user text early, and an ordinary wrapper can
forward another component's serialized result. A `WeakSet`-only prototype exposed
the early text as HTML and escaped the forwarded markup. The
[server return regressions](../packages/octane/tests/server-renderable-contract.test.ts)
protect both cases across buffered and streaming renderers.
Ordered hook replay reuses staged Action records. Prefix snapshots and urgent
operation indices allocate only when those queues overlap; the committed-input
snapshot is limited to urgent ancestor traversal of a queued transition.
Manual-slot packages adapt their hook definitions, allowing bound and
forwarded aliases to retain their internal slots while ordinary custom hooks
receive exactly the authored arguments. Declaration adapters are hoisted with
their private implementation, preserving early calls and cyclic imports without
module-initialization assignments that retain unused providers. Expression
adapters use a pure factory. Production bundling tests verify that an unused
provider and its dependency disappear, while a retained export keeps both
reachable. The invocation adapter avoids a second argument array for calls with
up to four authored arguments. Render-phase self-updates
reuse the existing pending flag and retry limit; output entrypoints check that
flag before initializing children from discarded parent inputs. This does not
make template execution transactional: an expression in a later sibling cannot
roll back a child that an earlier sibling already initialized. Keep render-phase
self-updates in setup when they must settle before child initialization.

Measurements compare the baseline above with the candidate using the same
installed dependencies and authored fixtures on Node 26.4.0 and Chromium:

| Control | Baseline → candidate | Interpretation |
| --- | --- | --- |
| `benchmarks/hook-memo/run.mjs` operation and allocation counters | Identical | Ordinary render/memo creation counts stay unchanged. These counters are not a full heap census. |
| Hook-memo complete production bundles, gzip | 54,611 → 57,959 bytes; 55,159 → 58,521 bytes | The whole patch adds 3,348 / 3,362 bytes in the runtime / inline variants. |
| Hook transition, 40 alternating samples of 500 complete cycles after 1,000 warmups | 2.8 → 3.6 µs median | Observed 0.8 µs / 29% increase on this fixture. Value, pending, and layout-commit controls pass. |
| `benchmarks/ssr-throughput/run.mjs`, compiled deopt-page fixture | 1.761 → 1.914 ms | About 9% higher median render score, including string materialization. |
| Same SSR fixture through descriptors | 3.656 → 3.901 ms | About 7% higher median render score. |
| Hook-memo compiled fixture output, minified | 5,784 → 6,497 bytes; 7,183 → 7,896 bytes | Setup checkpoints and manual provider adaptation add 713 bytes in each variant. |

SSR uses three alternating runs with `CONFIGS=deopt-page`, a one-second timed
budget per configuration, and 500 memory-phase renders. Baseline and candidate
bundles are built separately from the archived base and candidate sources; only
the existing runner's bundle and helper paths change. Its body-equivalence gates
pass, and body lengths remain 134,189 / 148,003 bytes. Short-run memory deltas are
GC-sensitive and are not used as retention evidence.
The SSR figures retain the original audit measurement; that serializer fixture
does not call hooks affected by the later argument and slot fixes. Bundle and
transition measurements above include those follow-ups.
All 28 minimal production bundle scenarios pass their behavior and dependency
reachability gates. Their fixtures observe committed visible Suspense content
before starting a transition, await the bound store's committed snapshot, and
use renderable descriptors for server markup. Controls that release the hold,
omit the store increment, or return escaped markup still fail.
An isolated manual-provider benchmark compares the follow-up against the prior
`ff70daab3` adapter on Node 24.20.0/macOS ARM64: fifteen alternating million-call
samples after six warmups measured bound calls at 6.79 → 12.49 ns and forwarded
calls at 21.77 → 31.31 ns. Return values, slot identity, receiver, name, and arity
match. Removing unused-provider retention therefore trades a measurable 5.7–9.5 ns
per manual invocation for the smaller dependency graph; this is not an
application render measurement.
The final transition sample ran after the broad suites completed. A preceding
sample under concurrent test load measured 4.6 / 5.8 µs (26% increase), supporting
the slowdown direction while showing that absolute timings depend on machine
load. These results describe this minimal workload rather than application-wide
throughput.

The existing keyed-row browser harness passes all 28 order and survivor-identity
gates. Twelve timing samples per target were noisy: several insertion medians
changed from 0.3 to 0.4 ms while other operations were unchanged or lower. Compiler
and event timings taken under concurrent test load are also inconclusive. These
results support no general speedup claim. The descriptor fallbacks, server
carrier allocations, and larger runtime bundle are explicit correctness costs.
Current-head validation commands and CI outcomes are recorded in the pull request.
