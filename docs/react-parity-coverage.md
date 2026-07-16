# React parity coverage (generated)

<!-- GENERATED FILE — do not edit. Refresh with:
pnpm react-parity:generate -- --baseline stable --react-root /path/to/react-v19.2.7
pnpm react-parity:generate -- --baseline canary --react-root /path/to/react-main
-->

This report separates distinct Octane tests, React upstream scenarios, renderer/mode registrations, and CI executions. Those numbers are different units and must not be added together or described interchangeably as “ported React tests.”

## Octane test baseline

| Measure | Count |
| --- | ---: |
| Normal core cases | 2,756 |
| ↳ conformance | 1,330 |
| ↳ differential | 137 |
| ↳ hydration | 135 |
| ↳ other runtime/compiler/SSR | 1,154 |
| Profiling-only cases | 14 |
| Distinct core cases including profiling | 2,770 |
| Production-compile reruns of normal core | 2,756 |
| All workspace executions | 8,162 |
| React-source-attributed file upper bound | 1,345 cases in 78 files |

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
| stable | 5,345 | 4,449 | 378 | 0 | 317 | 201 | 0 |
| canary | 5,413 | 4,506 | 389 | 0 | 324 | 194 | 0 |

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
| Lazy components | 40 / 40 | 41 / 41 | high | covered | runtime | Nineteen lazy resolution, rejection, function-component default-prop, memo, identity, and reorder cases have executable evidence; three ergonomic/component-form differences and twenty unsupported class, forwardRef, legacy-root, owner-stack, or exotic-type cases have durable documented dispositions. |
| External stores | 19 / 19 | 19 / 19 | high | covered | runtime | Seventeen snapshot, notification, selector, error, and hydration outcomes have executable evidence; React 17 legacy-shim timing and selector invocation-count optimization are documented non-goals. |
| Update reconciliation | 42 / 42 | 45 / 45 | high | covered | runtime | Twenty-five function/hook batching, ordering, deletion, re-entry, and loop-stability outcomes have executable evidence; synchronous first-mount timing is an executable documented divergence and twenty-one class, legacy, Fiber, or owner-stack cases are documented non-goals. |
| Fizz streaming | 207 / 207 | 207 / 207 | high | in_progress | SSR + hydration | Wave 4 has exact executable evidence for 38 cases in the stable/canary union (35 stable and 38 canary), with 81 conservative durable dispositions and 104 still planned. Coverage includes public transport, suspension, abort, parser-context, context-isolation, Usable-node, hydration, and deep-tree outcomes; class, selective-hydration, experimental, internal, and document-orchestration cases remain outside Octane's supported surface. |
| Server integration matrix | 387 / 1,569 | 389 / 1,579 | high | in_progress | SSR + hydration | Wave 4 has exact executable evidence for 46 rendering, serialization, hook, ref, form-control, hydration-adoption, and mismatch-recovery cases in both stable and canary, including a shared five-mode matrix. Wave 1 supplies another 17 untrusted-URL cases, for 63 covered cases in this policy; 57 cases carry durable dispositions and 286 remain planned. Class components, legacy roots/context, StrictMode double-invoke, private dispatchers, and unsupported types are explicit non-goals. |
| React repository lint rules | 5 / 5 | 5 / 5 | low | documented | tooling | React's internal ESLint RuleTester fixtures validate repository tooling, not observable UI framework behavior in Octane. |

### Migration sequence and exit criteria

1. **Wave 1 — critical blockers (completed 2026-07-15):** Effect Event semantics and shared untrusted-URL sanitization are implemented, ported, and linked to executable ledger evidence.
2. **Wave 2 — public API and reconciliation (completed 2026-07-15):** supported root, fragment, element/Children, and lazy-component outcomes have live evidence; excluded outcomes have durable divergence/non-goal dispositions.
3. **Wave 3 — scheduling and stores (completed 2026-07-15):** supported update-reconciliation and external-store outcomes have live evidence; excluded class, legacy, Fiber-policy, and optimization-only cases have durable dispositions.
4. **Wave 4 — server matrix (audit complete; implementation in progress):** 612 Fizz and server-integration cases were reviewed. Exact live evidence covers 84 Wave 4 cases, 138 have conservative durable dispositions, and 390 remain planned. The shared matrix exercises client, buffered SSR, streaming SSR, matching hydration, mismatch recovery, and production compilation; class and legacy React remain explicit non-goals.
5. **Residual audit:** assign risk and a durable disposition to every remaining untriaged case, with canary drift reviewed continuously.

A case exits the queue only as `covered` with live local evidence, or as a `documented` divergence/non-goal with rationale. Committed conformance work must remain executable; `skip`, `todo`, and expected-failure placeholders are not completion states.

## Extraction limits

The inventory follows React's pinned OSS source Jest discovery rule: direct files under `__tests__` in `packages` and `scripts`, with the source-config exclusions recorded in [react-upstreams.json](../packages/octane/audit/react-upstreams.json). It recognizes direct `it`/`test` registrations, gate pragmas and transformed gates, static `.each` matrices, registrar loops, and the React DOM server integration helpers. Dynamic loops/matrices are retained as manual-review cases with unknown expansion counts. Possible custom registrar names are recorded per suite for audit rather than silently counted as exact.
The refresh commands require checkouts at the exact commits pinned in `react-upstreams.json`; generation rejects any other HEAD.
