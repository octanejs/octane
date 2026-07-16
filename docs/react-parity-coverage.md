# React parity coverage (generated)

<!-- GENERATED FILE — do not edit. Refresh with:
pnpm react-parity:generate -- --baseline stable --react-root /path/to/react-v19.2.7
pnpm react-parity:generate -- --baseline canary --react-root /path/to/react-main
-->

This report separates distinct Octane tests, React upstream scenarios, renderer/mode registrations, and CI executions. Those numbers are different units and must not be added together or described interchangeably as “ported React tests.”

## Octane test baseline

| Measure | Count |
| --- | ---: |
| Normal core cases | 3,584 |
| ↳ conformance | 2,075 |
| ↳ differential | 137 |
| ↳ hydration | 135 |
| ↳ other runtime/compiler/SSR | 1,237 |
| Profiling-only cases | 14 |
| Distinct core cases including profiling | 3,598 |
| Production-compile reruns of normal core | 3,584 |
| All workspace executions | 9,955 |
| React-source-attributed file upper bound | 2,079 cases in 84 files |

The production project reruns the same normal core cases in another compile mode; it is not another set of conformance ports. The React-source-attributed definition is: Every collected normal-core case in a local file containing at least one React upstream *-test.js or *-test.ts filename citation; this is a generous file-level upper bound, not a one-to-one port count. Counts were measured on 2026-07-16.

## Pinned React inventories

| Baseline | Commit | Suites | Direct declarations | Helper declarations | Concrete cases | Known registrations | Minimum registrations | Unknown expansions |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| stable (v19.2.7) | `6117d7cca490` | 326 | 5,020 | 325 | 5,345 | 6,591 | 6,603 | 12 |
| canary (main@2026-07-15) | `b740af2510de` | 326 | 5,086 | 327 | 5,413 | 6,667 | 6,679 | 12 |

A logical declaration is one source registration site. Static `.each` rows become concrete case IDs. “Known registrations” sums expansions that can be proven statically; “minimum registrations” counts every unknown loop/dynamic expansion once, so it remains a lower bound. React DOM server helpers carry their explicit five- or three-mode expansion.

The direct totals include 27 CoffeeScript registrations in `ReactCoffeeScriptClass-test.coffee`. The five React-repository ESLint RuleTester suites are represented by explicit unknown-expansion cases and dispositioned as tooling non-goals; no discovered suite is silently empty.

### Possible custom registrar review

These name-pattern candidates look like custom `it*`/`test*` helpers but are not in the proven expansion registry. Raw occurrences may include ordinary helper calls, comments, or strings, so they are a manual-review queue and are not added to the registration floor.

| Candidate | Stable raw occurrences | Canary raw occurrences |
| --- | ---: | ---: |
| `itHydratesWithoutMismatch` | 6 | 6 |
| `testAllPermutations` | 2 | 2 |
| `testContentEditableComponent` | 3 | 3 |
| `testDOMNodeStructure` | 5 | 5 |
| `testEmulatedBubblingEvent` | 34 | 34 |
| `testEmulatedBubblingEventWithTargetListener` | 2 | 2 |
| `testEmulatedBubblingEventWithoutTargetListener` | 2 | 2 |
| `testFunction` | 2 | 2 |
| `testInputComponent` | 4 | 4 |
| `testJavaScript` | 1 | 1 |
| `testMismatch` | 38 | 38 |
| `testNativeBubblingEvent` | 47 | 49 |
| `testNativeBubblingEventWithTargetListener` | 2 | 2 |
| `testNativeBubblingEventWithoutTargetListener` | 2 | 2 |
| `testNativeStopPropagationInInnerBubblePhase` | 2 | 2 |
| `testNativeStopPropagationInInnerCapturePhase` | 4 | 4 |
| `testNativeStopPropagationInInnerEmulatedBubblePhase` | 2 | 2 |
| `testNativeStopPropagationInOuterBubblePhase` | 2 | 2 |
| `testNativeStopPropagationInOuterCapturePhase` | 4 | 4 |
| `testNonBubblingEvent` | 3 | 3 |
| `testNonBubblingEventWithTargetListener` | 2 | 2 |
| `testNonBubblingEventWithoutTargetListener` | 2 | 2 |
| `testPropsSequence` | 27 | 27 |
| `testPropsSequenceWithPreparedChildren` | 4 | 4 |
| `testReactStopPropagationInInnerBubblePhase` | 4 | 4 |
| `testReactStopPropagationInInnerCapturePhase` | 4 | 4 |
| `testReactStopPropagationInOuterBubblePhase` | 2 | 2 |
| `testReactStopPropagationInOuterCapturePhase` | 4 | 4 |
| `testRemountingWithWrapper` | 16 | 16 |
| `testResolvedOutput` | 7 | 7 |
| `testScopeQuery` | 3 | 3 |
| `testTypeScript` | 1 | 1 |
| `testUnknownAttributeAssignment` | 12 | 12 |
| `testUnknownAttributeRemoval` | 5 | 5 |
| `testUpdates` | 8 | 8 |
| `testUserInteractionBeforeClientRender` | 15 | 15 |
| `testWithPointerType` | 1 | 1 |

## Ledger coverage

Every concrete case in either pinned inventory has exactly one ledger disposition. Non-critical cases may remain `untriaged`; critical cases may not.

| Baseline | Cases | Untriaged | Planned | In progress | Covered | Documented | Blocked |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| stable | 5,345 | 0 | 2,071 | 0 | 849 | 2,425 | 0 |
| canary | 5,413 | 0 | 2,124 | 0 | 890 | 2,399 | 0 |

Classifications are `portable`, `adaptable`, `divergence`, and `non_goal`. A covered case requires live local test evidence; divergence and non-goal dispositions require a rationale.

## Priority migration queue

Suite policies are machine-readable in `react-upstreams.json`; the first matching policy owns a case, so the critical URL suite is not diluted by the wider server-integration workstream. Counts are shown as concrete cases / minimum registrations.

| Workstream | Stable | Canary | Risk | Status | Owner | Rationale |
| --- | ---: | ---: | --- | --- | --- | --- |
| Effect Event semantics | 12 / 12 | 17 / 17 | critical | covered | runtime | Executable stable/canary adaptations cover fresh wrapper identity, render-call guards, commit-time publication, effect ordering, Activity/context integration, and suspended or failed renders. |
| Untrusted URL security | 17 / 77 | 17 / 77 | critical | covered | runtime + SSR | An executable render-mode matrix covers one shared javascript: URL sanitizer across client, compiler-baked literals, SSR, streaming, updates, SVG, forms, and hydration. |
| Root semantics | 27 / 27 | 27 / 27 | high | covered | runtime | Twenty-five public root cases have exact-title client and production-compile evidence; the component-body render entry point and safe teardown after external DOM removal are executable, documented divergences. |
| Fragment reconciliation | 29 / 29 | 29 / 29 | high | covered | runtime | Twenty-eight fragment identity and reconciliation cases have exact-title client and production-compile evidence; React's internal lazy-to-element shape has a documented non-goal disposition and executable component-module adaptation. |
| Element and Children APIs | 111 / 111 | 111 / 111 | high | covered | public API | Ninety-five public Children, element creation, clone, validation, iterable, thenable, key, ref, freezing, and function-default-prop cases have executable evidence; sixteen React owner/component-stack, legacy-transform, class, and private-element diagnostics are documented non-goals. |
| Lazy components | 40 / 40 | 41 / 41 | high | covered | runtime | Eighteen lazy resolution, rejection, function-component default-prop, memo, identity, and reorder cases have executable evidence; four ergonomic/component-form differences and twenty unsupported class, forwardRef, legacy-root, owner-stack, or exotic-type cases have durable documented dispositions. |
| External stores | 19 / 19 | 19 / 19 | high | covered | runtime | Seventeen snapshot, notification, selector, error, and hydration outcomes have executable evidence; React 17 legacy-shim timing and selector invocation-count optimization are documented non-goals. |
| Update reconciliation | 42 / 42 | 45 / 45 | high | covered | runtime | Twenty-five function/hook batching, ordering, deletion, re-entry, and loop-stability outcomes have executable evidence; synchronous first-mount timing is an executable documented divergence and twenty-one class, legacy, Fiber, or owner-stack cases are documented non-goals. |
| Fizz streaming | 207 / 207 | 207 / 207 | high | covered | SSR + hydration | Wave 4 has exact executable evidence for 109 cases in the stable/canary union (100 stable and 109 canary), with durable dispositions for the other 114 cases and none still planned. Coverage includes public transport, suspension, abort, parser-context, context-isolation, Usable-node, hydration, synchronous iterables and thenables, and deep-tree outcomes; class, selective-hydration, experimental, internal, and document-orchestration cases remain outside Octane's supported surface. |
| Server integration matrix | 387 / 1,569 | 389 / 1,579 | high | covered | SSR + hydration | Wave 4 is complete: exact executable evidence covers 330 of the 389 non-URL server-integration cases and durable dispositions cover the other 59, with none still planned. Wave 1 separately covers all 17 untrusted-URL cases, bringing the full 406-case source family to 347 covered and 59 documented. The five-mode matrix exercises client rendering, buffered and streaming SSR, matching and mismatching hydration, and production compilation; class components, legacy roots/context, StrictMode double-invoke, private dispatchers, and unsupported types remain explicit non-goals. |
| React repository lint rules | 5 / 5 | 5 / 5 | low | documented | tooling | React's internal ESLint RuleTester fixtures validate repository tooling, not observable UI framework behavior in Octane. |
| Server Components and Flight | 322 / 322 | 363 / 363 | low | documented | out of scope | Octane does not implement React Server Components, Flight serialization, server references, or the webpack/turbopack Flight transports; these cases do not exercise the supported client or SSR APIs. |
| Non-DOM React renderers | 222 / 222 | 164 / 164 | low | documented | out of scope | React Native, Fabric, ART, react-test-renderer, shallow-renderer, and react-markup host protocols are separate renderer products rather than Octane's observable DOM/runtime contract. |
| React Refresh tooling | 123 / 123 | 137 / 137 | low | documented | compiler + integrations | React Refresh's Babel transform, global family registry, and renderer injection protocol are React-specific tooling; Octane owns its compiler and Vite HMR contract independently. |
| React DevTools and profiling internals | 129 / 129 | 129 / 129 | low | documented | out of scope | React DevTools hook inspection, timeline geometry, Fiber duration accounting, and Profiler callbacks are not Octane public APIs. |
| React repository test infrastructure | 213 / 213 | 181 / 181 | low | documented | tooling | React's Jest helpers, gate transforms, error-code build transforms, and event-test utilities validate the React repository's own test/build infrastructure rather than consumer-visible framework behavior. |
| React Scheduler package | 73 / 73 | 73 / 73 | low | documented | scheduler | The standalone React Scheduler package, mock scheduler, profiling buffer, and host fallback implementations are not exported by Octane; observable Octane scheduling semantics are audited through runtime tests instead. |
| Legacy, class, StrictMode, and forwardRef surfaces | 511 / 511 | 512 / 512 | low | documented | out of scope | Octane intentionally has no class components, legacy roots/context/lifecycles, StrictMode double invocation, forwardRef, or createRef; renderer-level outcomes are ported separately through function components and ref-as-prop tests. |
| React synthetic event system | 151 / 151 | 152 / 152 | low | documented | events | Octane uses delegated native DOM events and deliberately has no SyntheticEvent classes, event plugins, pooling, synthetic onChange normalization, or plugin dispatch queues; native observable outcomes are covered separately. |
| Selective and partial hydration | 137 / 137 | 142 / 142 | low | documented | hydration | Octane hydrates synchronously and has no synthetic event replay or Fiber lane machinery for selective or priority hydration; full-root and streamed-boundary adoption remain covered public contracts. |
| Unsupported Suspense surfaces | 102 / 102 | 107 / 107 | low | documented | suspense | SuspenseList, CPU/expected-load-time Suspense, suspense callbacks, suspensey host-resource commit semantics, placeholder internals, and legacy/Strict Activity variants are outside Octane's supported component surface. |
| Event traversal outcomes | 11 / 11 | 11 / 11 | high | covered | events | Eleven executable client and production-compile adaptations cover two-phase click traversal and native enter/leave outcomes through Octane's public delegated-event surface; React's private traversal helpers and synthetic mechanism are not asserted. |
| Private DOM renderer surfaces | 83 / 83 | 83 / 83 | low | documented | out of scope | React's private test-selector, Scope, singleton/document ownership, DOM-to-Fiber lookup, character-offset, child-reconciler, traversal, and return-pointer protocols are not Octane public APIs. |
| Unsupported React packages | 32 / 32 | 32 / 32 | low | documented | out of scope | React's deprecated cache package, react-is exotic Fiber type inspection, and shared private build helpers are not Octane package surfaces. |
| Legacy and class case-level surfaces | 77 / 79 | 79 / 81 | low | documented | out of scope | Cases whose individual outcome requires class components, legacy roots/context, StrictMode double invocation, forwardRef/createRef/findDOMNode, or string refs are explicit non-goals even when they live in an otherwise modern React suite; supported function-component outcomes in the same files remain planned or covered independently. |
| External-store compatibility packages | 12 / 12 | 12 / 12 | medium | planned | runtime | The standalone compatibility packages are not shipped by Octane, but their observable subscription, snapshot, and notification semantics are actionable through Octane's useSyncExternalStore API. |
| React core residual audit | 79 / 79 | 78 / 78 | medium | planned | public API + runtime | Remaining function-component, element, JSX-runtime, context, transition, and diagnostic outcomes require exact Octane public-API evidence or a narrower case-level divergence disposition. |
| React DOM residual audit | 1,417 / 1,431 | 1,470 / 1,484 | high | planned | runtime + SSR + hydration | Remaining public DOM rendering, attributes, forms, native event outcomes, resource hints, SSR, hydration, refs, and reconciliation cases require exact behavioral evidence or a narrower case-level disposition. |
| React reconciler residual audit | 755 / 755 | 781 / 781 | high | planned | runtime | Remaining function-component hooks, effects, context, Suspense, transitions, Activity, batching, error recovery, and reconciliation outcomes require exact observable Octane evidence; Fiber-only mechanics will receive case-level non-goal dispositions. |
| Residual repository surface | 0 / 0 | 0 / 0 | low | planned | parity audit | This final audited catch-all keeps newly discovered or uncommon React suites visible and actionable until they receive executable public evidence or a narrower documented non-goal/divergence disposition. |

### Migration sequence and exit criteria

1. **Wave 1 — critical blockers (completed 2026-07-15):** Effect Event semantics and shared untrusted-URL sanitization are implemented, ported, and linked to executable ledger evidence.
2. **Wave 2 — public API and reconciliation (completed 2026-07-15):** supported root, fragment, element/Children, and lazy-component outcomes have live evidence; excluded outcomes have durable divergence/non-goal dispositions.
3. **Wave 3 — scheduling and stores (completed 2026-07-15):** supported update-reconciliation and external-store outcomes have live evidence; excluded class, legacy, Fiber-policy, and optimization-only cases have durable dispositions.
4. **Wave 4 — server matrix (completed 2026-07-16):** all 612 Fizz and server-integration cases have exited the queue. Exact live evidence covers 439 cases and 173 have conservative durable dispositions; none remain planned. The shared matrix exercises client, buffered SSR, streaming SSR, matching hydration, mismatch recovery, and production compilation; class and legacy React remain explicit non-goals.
5. **Residual audit (completed 2026-07-16):** every case in the stable/canary union has an assigned risk, owner, workstream, and durable status. There are zero untriaged cases; supported planned work remains visible rather than being mislabeled as a port, while class, legacy, private-renderer, synthetic-event, and Server Component surfaces have explicit non-goal dispositions.

A case exits the queue only as `covered` with live local evidence, or as a `documented` divergence/non-goal with rationale. Committed conformance work must remain executable; `skip`, `todo`, and expected-failure placeholders are not completion states.

## Extraction limits

The inventory follows React's pinned OSS source Jest discovery rule: direct files under `__tests__` in `packages` and `scripts`, with the source-config exclusions recorded in [react-upstreams.json](../packages/octane/audit/react-upstreams.json). It recognizes direct `it`/`test` registrations, gate pragmas and transformed gates, static `.each` matrices, registrar loops, and the React DOM server integration helpers. Dynamic loops/matrices are retained as manual-review cases with unknown expansion counts. Possible custom registrar names are recorded per suite for audit rather than silently counted as exact.
The refresh commands require checkouts at the exact commits pinned in `react-upstreams.json`; generation rejects any other HEAD.
