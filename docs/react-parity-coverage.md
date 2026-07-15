# React parity coverage (generated)

<!-- GENERATED FILE — do not edit. Refresh with:
pnpm react-parity:generate -- --baseline stable --react-root /path/to/react-v19.2.7
pnpm react-parity:generate -- --baseline canary --react-root /path/to/react-main
-->

This report separates distinct Octane tests, React upstream scenarios, renderer/mode registrations, and CI executions. Those numbers are different units and must not be added together or described interchangeably as “ported React tests.”

## Octane test baseline

| Measure | Count |
| --- | ---: |
| Normal core cases | 2,260 |
| ↳ conformance | 985 |
| ↳ differential | 136 |
| ↳ hydration | 135 |
| ↳ other runtime/compiler/SSR | 1,004 |
| Profiling-only cases | 14 |
| Distinct core cases including profiling | 2,274 |
| Production-compile reruns of normal core | 2,260 |
| All workspace executions | 7,135 |
| React-source-attributed file upper bound | 968 cases in 68 files |

The production project reruns the same normal core cases in another compile mode; it is not another set of conformance ports. The React-source-attributed definition is: Every collected normal-core case in a local file containing at least one React upstream *-test.js or *-test.ts filename citation; this is a generous file-level upper bound, not a one-to-one port count. Counts were measured on 2026-07-15.

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
| stable | 5,345 | 4,449 | 862 | 0 | 29 | 5 | 0 |
| canary | 5,413 | 4,506 | 868 | 0 | 34 | 5 | 0 |

Classifications are `portable`, `adaptable`, `divergence`, and `non_goal`. A covered case requires live local test evidence; divergence and non-goal dispositions require a rationale.

## Priority migration queue

Suite policies are machine-readable in `react-upstreams.json`; the first matching policy owns a case, so the critical URL suite is not diluted by the wider server-integration workstream. Counts are shown as concrete cases / minimum registrations.

| Workstream | Stable | Canary | Risk | Status | Owner | Rationale |
| --- | ---: | ---: | --- | --- | --- | --- |
| Effect Event semantics | 12 / 12 | 17 / 17 | critical | covered | runtime | Executable stable/canary adaptations cover fresh wrapper identity, render-call guards, commit-time publication, effect ordering, Activity/context integration, and suspended or failed renders. |
| Untrusted URL security | 17 / 77 | 17 / 77 | critical | covered | runtime + SSR | An executable render-mode matrix covers one shared javascript: URL sanitizer across client, compiler-baked literals, SSR, streaming, updates, SVG, forms, and hydration. |
| Root semantics | 27 / 27 | 27 / 27 | high | planned | runtime | Port public createRoot, update, unmount, error, and scheduling outcomes while filtering renderer internals. |
| Fragment reconciliation | 29 / 29 | 29 / 29 | high | planned | runtime | Expand fragment reconciliation, ref, nesting, and top-level outcome coverage. |
| Element and Children APIs | 111 / 111 | 111 / 111 | high | planned | public API | Audit and port observable Children, element creation, JSX-element, and clone behavior against Octane's public API. |
| Lazy components | 40 / 40 | 41 / 41 | high | planned | runtime | Expand lazy resolution, rejection, retry, default-export, and Suspense interaction coverage. |
| External stores | 19 / 19 | 19 / 19 | high | planned | runtime | Port store mutation, snapshot consistency, selector, error, and hydration outcomes. |
| Update reconciliation | 42 / 42 | 45 / 45 | high | planned | runtime | Port renderer-observable update ordering, batching, interruption, and reconciliation outcomes. |
| Fizz streaming | 207 / 207 | 207 / 207 | high | planned | SSR + hydration | Filter and port applicable streaming, abort, error, shell, resource, and hydration behavior. |
| Server integration matrix | 387 / 1,569 | 389 / 1,579 | high | planned | SSR + hydration | Build the client, buffered SSR, streaming SSR, matching hydration, and mismatch-recovery matrix. |
| React repository lint rules | 5 / 5 | 5 / 5 | low | documented | tooling | React's internal ESLint RuleTester fixtures validate repository tooling, not observable UI framework behavior in Octane. |

### Migration sequence and exit criteria

1. **Wave 1 — critical blockers (completed 2026-07-15):** Effect Event semantics and shared untrusted-URL sanitization are implemented, ported, and linked to executable ledger evidence.
2. **Wave 2 — public API and reconciliation:** root, fragment, element/Children, and lazy-component outcomes.
3. **Wave 3 — scheduling and stores:** update reconciliation and external-store consistency.
4. **Wave 4 — server matrix:** applicable Fizz streaming cases, then the five-mode server integration matrix.
5. **Residual audit:** assign risk and a durable disposition to every remaining untriaged case, with canary drift reviewed continuously.

A case exits the queue only as `covered` with live local evidence, or as a `documented` divergence/non-goal with rationale. Committed conformance work must remain executable; `skip`, `todo`, and expected-failure placeholders are not completion states.

## Extraction limits

The inventory follows React's pinned OSS source Jest discovery rule: direct files under `__tests__` in `packages` and `scripts`, with the source-config exclusions recorded in [react-upstreams.json](../packages/octane/audit/react-upstreams.json). It recognizes direct `it`/`test` registrations, gate pragmas and transformed gates, static `.each` matrices, registrar loops, and the React DOM server integration helpers. Dynamic loops/matrices are retained as manual-review cases with unknown expansion counts. Possible custom registrar names are recorded per suite for audit rather than silently counted as exact.
The refresh commands require checkouts at the exact commits pinned in `react-upstreams.json`; generation rejects any other HEAD.
