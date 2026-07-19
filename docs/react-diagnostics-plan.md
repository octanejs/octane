# React/ReactDOM diagnostic parity plan

## Objective

Octane should provide the useful development-time diagnostics that apply to its
React-shaped API and DOM renderer, including meaningful message variants,
without inheriting React's production error numbers or shipping React's complete
diagnostic text in optimized bundles.

This is a rolling parity program, not a version matrix. Each tranche inspects the
latest upstream React and ReactDOM sources available when the work starts. A test
may cite the inspected upstream file or commit for reproducibility, but Octane
does not maintain parallel catalogs for React releases.

## Current upstream audit basis

This inventory was checked against React `main` at commit
[`83840902c890f0eb85decda239ef6b1b14945779`](https://github.com/facebook/react/tree/83840902c890f0eb85decda239ef6b1b14945779),
the head of the repository when the audit was refreshed on 2026-07-19. The commit
is provenance for the inspection, not a React-version compatibility promise. A
later tranche updates this one baseline in place instead of adding another
versioned inventory.

The audit covers consumer-observable diagnostics in React core, the reconciler,
React DOM client/shared bindings, and Fizz. It does not copy React's messages or
numeric codes into an Octane data file. The paths in the matrix below identify
where the behavior was inspected; Octane's own tests and catalog remain the
executable source of truth.

Bare upstream filenames in the matrix resolve against these source paths at the
audited commit:

- React core: `packages/react/src/` and `packages/react/src/jsx/`;
- reconciler: `packages/react-reconciler/src/`;
- public DOM roots: `packages/react-dom/src/client/`;
- DOM host validation: `packages/react-dom-bindings/src/shared/`,
  `packages/react-dom-bindings/src/client/`, and
  `packages/react-dom-bindings/src/events/`;
- Fizz/SSR: `packages/react-dom-bindings/src/server/` and
  `packages/react-server/src/`.

Test paths in the evidence column are relative to `packages/octane/tests/`
unless the path starts elsewhere.

## Scope rules

Every upstream diagnostic is triaged into one of four outcomes:

1. **Exact behavioral parity.** The underlying API contract is shared, so Octane
   matches the trigger, channel, recovery behavior, variants, and dedupe lifetime.
2. **Adapted parity.** The trigger is shared but Octane's architecture changes the
   useful guidance. The message explains Octane's compiler, native-event, or
   scheduling model instead of referring to an inapplicable React mechanism.
3. **Intentional divergence.** Octane deliberately supports different behavior.
   A passing test documents the Octane contract and explains why the React
   diagnostic must not fire.
4. **Unsupported surface.** Diagnostics for APIs Octane does not expose—class
   components, legacy roots, Server Components, StrictMode double invocation,
   and private renderer internals—do not become runtime code merely for parity.

Do not copy React's numeric codes, generated error map, or production decoder
data. Upstream source is behavioral evidence; Octane owns its wording, code
allocation, compatibility policy, and website catalog.

## Observable contract for each diagnostic

A conformance test is complete only when it records the observable dimensions
that matter for that case:

- exact trigger and negative controls;
- `console.error`, `console.warn`, thrown `Error` subclass, callback, or compiler
  diagnostic channel;
- distinct wording for value/type/host/API variants;
- whether rendering, dispatch, hydration, or streaming recovers;
- dedupe boundary (call, prop, component, root, module, or process lifetime);
- component/source context when Octane can attribute it;
- client, server, hydration, and production behavior where applicable;
- the reason for adapted wording or an intentional divergence.

Tests must exercise public behavior. Source-string assertions are additional
production-artifact evidence, not a substitute for triggering the failure.

## Production error architecture

The initial coded surface is deliberately bounded to framework-created errors in
`runtime.ts` and `runtime.server.ts`, the core DOM client and server runtimes.

- `packages/octane/error-codes/codes.json` is the canonical Octane-owned catalog.
- Codes are append-only. A published number, message template, argument shape,
  and existing runtime surface cannot be removed or repurposed. Retirement leaves
  a tombstone so deployed URLs continue to decode.
- Generated client/server formatters reconstruct complete messages only in
  development. Production retains the Octane code, ordered encoded arguments,
  and `https://octanejs.dev/errors/<code>`.
- User-thrown values, transported server errors, abort reasons, and compiler
  `OCTANE_*` diagnostics are not rewritten as framework failures.
- The generator uses the TypeScript AST to reject unknown codes, wrong surfaces,
  wrong argument counts, uncataloged `Error` constructors, comment-only uses, and
  message expressions that would retain an uncoded framework prefix.
- Vite and Rsbuild pin production mode in their Node server graphs so the complete
  development tables are removed even when server minification is disabled.
- The website imports the committed canonical catalog and route-splits it from
  unrelated pages. It never fetches a mutable external map.

Adding another runtime surface requires an explicit catalog decision, a scanner
boundary, public failure execution, and a representative real-bundler artifact
test. It is not covered implicitly by the first tranche.

## Latest-main diagnostic inventory

Status meanings are deliberately strict:

- **Implemented** means the stated, bounded Octane behavior has executable
  evidence; it does not imply every diagnostic in the upstream source file.
- **Partial** means some applicable triggers or variants are executable and the
  remaining work is named.
- **Pending** means the runtime behavior may exist, but diagnostic parity has not
  yet been established.
- **Divergent** means Octane intentionally exposes a different contract.
- **Not applicable** means Octane does not expose the underlying API.

| Surface | Diagnostic family and latest-main source | Status | Current Octane evidence | Explicit remainder or difference |
| --- | --- | --- | --- | --- |
| Production client + SSR | Framework-created failures in `ReactChildren.js`, `ReactLazy.js`, `ReactChildFiber.js`, `ReactFiberHooks.js`, `ReactDOMRoot.js`, `ReactDOMComponent.js`, `ReactFizzHooks.js`, and `ReactFizzServer.js` | **Implemented, bounded surface** | `packages/octane/error-codes/codes.json`; `scripts/error-codes/generate.mjs`; `packages/octane/tests/production-error-bundle.test.ts` | The 46 Octane-owned codes exhaust the audited framework-created failures in `runtime.ts` and `runtime.server.ts`, including invalid delegated-listener dispatch, not every package/runtime surface. Compiler, profiling, universal-renderer, React-host bridge, and server-RPC errors require separate opt-in tranches. |
| React core + reconciler | Element, JSX, `Children`, lazy, invalid child/type, key, and ref diagnostics from `ReactChildren.js`, `ReactLazy.js`, `ReactJSXElement.js`, `ReactChildFiber.js`, and `ReactFiberCommitEffects.js` | **Partial** | `conformance/element-children-api.test.ts`, `conformance/lazy-components.test.ts`, `conformance/deopt-list.test.ts`; production codes 2–4, 10, and 24 | Finish key owner/source context and dedupe, special-prop access, ref cleanup, iterable/thenable, and remaining invalid element-type variants. Owner-only and class-ref cases are not applicable. |
| React core + reconciler | Hook, effect, external-store, update-depth, action, and thenable diagnostics from `ReactFiberHooks.js`, `ReactFiberWorkLoop.js`, and `ReactFiberThenable.js` | **Partial + divergent** | `hooks.test.ts`, `callbacks.test.ts`, `auto-hook-deps.test.ts`, `conformance/react-hooks-scenarios.test.ts`, `conformance/external-store-shared.test.ts`; production codes 1, 9, 11, 12, 14, and 15 | Audit effect-return/dependency-shape, uncached snapshot, optimistic/action-state, and transition variants. Conditional hooks and inferred dependencies are intentional Octane divergences, so React hook-order guidance is not applicable. |
| DOM client/shared | Unknown-property and host-value diagnostics from `ReactDOMUnknownPropertyHook.js` and `ReactDOMComponent.js` | **Partial** | `conformance/dom-attributes.test.ts`, `conformance/server-integration-attributes-wave4d.test.ts`, and `conformance/ssr-attribute-diagnostics.test.ts`: dynamic and static true/false non-boolean values, NaN, plain objects, functions, symbols, curated casing, lowercase event-like functions, and module-global normalized-host-name dedupe | Add boolean-string/empty-string, `innerHTML`, `aria`, string-valued `is`, unknown camelCase, singular/plural invalid-prop aggregation, remaining event-name, URL, and coercion variants. React keys dedupe by authored prop name before aliasing; function/symbol aggregation and some custom-element/object-coercion behavior also remain adapted rather than exact. |
| DOM client/shared | ARIA name and casing diagnostics from `ReactDOMInvalidARIAHook.js` | **Pending** | Native `aria-*` serialization is covered by attribute tests | Add invalid camelCase, unknown lowercase, singular/plural aggregation, custom-element negatives, client hydration, and SSR diagnostics. |
| DOM client + SSR | Style name/value/coercion diagnostics from `CSSPropertyOperations.js` and `ReactFizzConfigDOM.js` | **Pending diagnostic audit** | Style application, scoped CSS, SSR, and hydration behavior have functional tests | Inventory string-vs-object, hyphenated/vendor names, semicolon values, NaN/Infinity, custom properties, coercion failures, and server variants before claiming warning parity. |
| DOM events | Invalid listeners from `getListener.js`, `ReactDOMEventListener.js`, and `InvalidEventListeners-test.js` | **Partial, adapted propagation** | `conformance/invalid-listeners.test.ts`, `event-callback-codegen.test.ts`, and `production-error-bundle.test.ts`: exact prop/type render warnings (including the `false` guidance), nullish silence, dispatched errors for invalid values, ancestor continuation, and production code 46 | Production uses an adapted native-event label instead of retaining a JSX prop string. Octane isolates invalid native listeners so an ancestor continues, unlike React's propagation behavior. Complete capture, replacement, non-delegated, throwing-listener, and custom-event variants remain pending. |
| DOM forms | Controlled values and actions from `ReactControlledValuePropTypes.js`, `ReactDOMInput.js`, `ReactDOMSelect.js`, `ReactDOMTextarea.js`, `ReactDOMComponent.js`, and `ReactDOMFormActions.js` | **Partial + adapted native events** | `conformance/controlled-{input,select,textarea,restore}.test.ts`, `differential/controlled-forms.test.ts`; controlled switches, missing `onInput`, and multiple-select shape have coverage | Finish `value`/`defaultValue`, `checked`/`defaultChecked`, null/read-only/disabled negatives, option/textarea child variants, form-action prop conflicts, and SSR warnings. Guidance uses native `onInput`/`change`, never React's synthetic `onChange`. |
| DOM client + hydration + SSR | Nesting and hydration diagnostics from `validateDOMNesting.js`, `ReactFiberHydrationContext.js`, and `ReactFiberHydrationDiffs.js` | **Partial** | `ssr-invalid-nesting.test.ts`, `conformance/hydration-mismatch.test.ts`, `hydration/mismatch-{value,structural}.test.ts`, and website real-server hydration coverage | Audit the full table/SVG/MathML/whitespace matrix, source/component context, warning dedupe, early-update cases, and recoverable-error routing. `suppressHydrationWarning` behavior exists but does not establish every upstream message variant. |
| DOM roots + boundaries | Root lifecycle, context, ref, and error-reporting diagnostics from `ReactDOMRoot.js`, `ReactContext.js`, `ReactFiberCommitEffects.js`, and `ReactFiberErrorLogger.js` | **Partial + divergent** | `conformance/root-semantics.test.ts`, `context.test.ts`, `conformance/error-handling-heuristics.test.ts`; production codes 18–22 and 27–29 | Complete root option/callback, ref cleanup, context identity, and boundary channel variants. Octane supports `root.render(Component, props)`, safely unmounts externally removed DOM, and reports uncaught errors through `console.error` rather than `onUncaughtError`. |
| Suspense client + SSR | `use()`, lazy, retry, and suspension diagnostics from `ReactFiberThenable.js`, `ReactLazy.js`, `ReactFizzThenable.js`, and `ReactFizzServer.js` | **Partial + divergent** | `suspense.test.ts`, `ssr-suspense.test.ts`, `conformance/fizz-streaming.test.ts`, `conformance/lazy-components.test.ts`; production codes 10, 23, and 32–37 | Audit uncached thenables, async component/use, replay/dedupe, and rejected-value variants. Octane's compiler deliberately starts independent `use()` work in parallel and emits Octane-specific waterfall guidance. |
| DOM SSR + resources | Host serialization, stream lifecycle, form/resource hints, and abort diagnostics from `ReactFizzConfigDOM.js`, `ReactFizzServer.js`, and `ReactDOMResourceValidation.js` | **Partial** | `conformance/fizz-streaming.test.ts`, `streaming-ssr.test.ts`, `resource-hints.test.ts`, and `conformance/ssr-attribute-diagnostics.test.ts`; production codes 30–45 | The initial host-value warning tranche now covers buffered/static rendering, both stream APIs, spread descriptors, and hoisted head output with module-global dedupe. Resource prop conflicts, preload/preinit variants, destination edge cases, and source context remain pending. User abort reasons stay opaque and are never recoded. |
| React-only surfaces | Class/legacy lifecycle and root diagnostics, StrictMode-only invocation, Server Components/Flight, React Native/test renderer, DevTools, and private Fiber invariants | **Not applicable** | Intentional-divergence table in `docs/react-parity-migration-plan.md` and the repository React conformance ledger | Re-triage only if Octane adds the corresponding public API. Do not ship dead warning branches solely to imitate an unsupported surface. |

## Work sequence

### Tranche A — production-code foundation and core errors

Completed in the initial implementation:

- allocate Octane codes for every framework-created `Error` construction in the
  two scoped DOM runtimes while preserving constructors, stacks, `AggregateError`
  contents, and user payloads;
- generate typed surface-specific formatters and enforce catalog compatibility in
  CI against the pull-request base or previous main commit;
- prove DEV reconstruction, production URL decoding, complete-message removal,
  warning removal, and representative public failures;
- add `/errors` search and `/errors/$code` decoding with opaque repeated arguments,
  escaping, missing/extra-argument feedback, real 404s, SSR, hydration, and SEO;
- pin production Node build intent in Vite and Rsbuild and measure the resulting
  server and client bundle reductions.

### Tranche B — high-frequency DOM guidance

Started in the initial implementation:

- invalid event-listener value families with prop/type render warnings, a
  dispatched `Error`, nullish silence, a `false`-specific variant, and Octane's
  deliberate ancestor-continuation behavior;
- boolean non-boolean-attribute true/false variants;
- NaN, plain-object, function, and symbol attribute values;
- lowercase event-like function props with Octane-native delegation guidance;
- module-global warning dedupe by normalized host name and production stripping
  across client, hydration, buffered/static SSR, streaming SSR, spreads, and
  hoisted head output. React's authored-name keying remains pending.

Continue with the remaining high-frequency host, style, ARIA, URL, and form
variants before low-frequency private or legacy cases.

### Tranche C — render lifecycle and hydration

Audit existing Octane diagnostics rather than assuming absence. Consolidate
duplicate warnings only when their trigger and lifetime are actually shared.
Cover clean mount, update, matching hydration, mismatch recovery, server render,
and production compilation as separate observation boundaries.

### Tranche D — hooks, Suspense, transitions, and core APIs

Port shared misuse diagnostics and explicitly record compiler-driven differences:
conditional hooks are valid, dependency arrays may be inferred, and independent
`use()` work is parallelized. Guidance must teach those Octane contracts instead
of suggesting React-only repairs.

### Tranche E — long-tail server/resource and unsupported-case audit

Finish public SSR/stream/resource diagnostics, then mark every remaining upstream
case as applicable, adapted, divergent, or unsupported. Unsupported diagnostics
must remain out of production bundles.

## Landing gates for every tranche

- Focused tests cite the latest inspected upstream source where useful and assert
  variants plus negative controls.
- Both `octane` and `octane-prod` compiler projects pass; DEV-only diagnostics are
  silent in production-compiled fixtures.
- The production artifact test proves complete messages and warning sentinels are
  absent from optimized client and server runtimes.
- Real Vite, Rsbuild, and Rspack server builds retain no development message text
  or dynamic `process.env.NODE_ENV` guard in the production graph.
- Website decoder tests cover any new argument shape without interpreting argument
  text as JSON or HTML.
- Bundle measurements compare the same fixtures and settings before and after.
- `pnpm typecheck`, the relevant behavioral suites, package builds, and repository-
  wide `pnpm format:check` pass.
- Framework-fundamental diffs receive an adversarial review for retained strings,
  wrong code-to-callsite mappings, user-error rewriting, hot-path allocation, and
  build-tool differences.

## Deliberate non-goals

- React-compatible numeric error codes or redirects from React's decoder.
- A committed mirror such as `react-diagnostics.json`.
- Per-React-version catalogs.
- Minifying application/user-thrown messages.
- Adding unsupported APIs solely so their warnings can be copied.
- Claiming exhaustive diagnostic parity before every applicable family above has
  executable evidence and an explicit disposition.
