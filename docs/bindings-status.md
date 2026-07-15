# @octanejs/\* bindings status (generated)

<!-- GENERATED FILE — do not edit. Edit packages/<name>/status.json and
     regenerate with `pnpm bindings:status`. -->

The central status table for the 25 `@octanejs/*` framework bindings.
Each row is sourced from that package's `packages/<name>/status.json` — the
machine-readable status block maintained next to the code it describes — merged
with the version in its `package.json`. CI runs `pnpm bindings:status:check`,
so a scope change that isn't reflected here fails the build.

The bindings deliberately sit at different maturity levels: some have broad
differential evidence against the real React library, others are thin bindings
over a framework-agnostic core, and some are explicitly partial or alpha. "Last
checked" records when the stated scope and its supporting evidence were most
recently reviewed. It does **not** certify full semantic parity outside the
supported surface and known test coverage described for that package.

| Package | Ports | Supported surface | Known divergences | SSR / hydration | Last checked |
| --- | --- | --- | --- | --- | --- |
| [`@octanejs/apollo-client`](#octanejsapollo-client) | `@apollo/client@4.2.6` | Complete published client adapter surface: all 18 @apollo/client/react runtime exports and their Apollo 4.2.6 TypeScript declarations, plus the framework-neutral root/testing exports and an Octane MockedProvider. | Suspense unwraps stable Apollo promises through Octane use() instead of React's use() or a thrown-promise fallback; The React class-based MockedProvider is an equivalent Octane function component; React Server Components and Apollo's React Compiler-generated entry are intentionally not exposed | Core hooks use Octane's server hook implementations, but Apollo's multi-pass non-Suspense query prepass, cache extraction/restore integration, and dedicated SSR/hydration tests remain open. | 2026-07-14 |
| [`@octanejs/base-ui`](#octanejsbase-ui) | `@base-ui/react@1.6.0` | Alpha, in progress: the foundation + overlay infrastructure and the first component set (Dialog, AlertDialog, Popover open-path) landed, ported at full fidelity and differential-verified against the real `@base-ui/react`. | Handlers receive native DOM events (no synthetic layer); `forwardRef` becomes ref-as-prop; `className` composes via octane's `normalizeClass` (the render-prop string merge matches Base UI exactly) | No dedicated SSR/hydration tests yet. | 2026-07-08 |
| [`@octanejs/dnd-kit`](#octanejsdnd-kit) | `@dnd-kit/react@0.5.0` | Complete modern dnd-kit React-adapter surface: DragDropProvider, DragOverlay, useDraggable/useDroppable, manager/monitor/operation hooks, PointerSensor/KeyboardSensor re-exports, the public signal-hook utilities, useSortable, and all four upstream entry points. | DragOverlay distinguishes octane compiled children blocks from function render props; ordinary typed usage is behaviorally equivalent | Static SSR and hydration are covered; DOM plugins initialize only after client refs register. | 2026-07-13 |
| [`@octanejs/floating-ui`](#octanejsfloating-ui) | `@floating-ui/react@0.27.19` | Positioning (`useFloating`, ref-aware `arrow`, the `@floating-ui/dom` middleware re-exports, the floating tree), the full interaction-hook set (`useInteractions`, `useHover` + `safePolygon`, `useClick`, `useFocus`, `useDismiss`, `useRole`, `useClientPoint`, `useListNavigation`, `useTypeahead`), the component layer (`FloatingPortal`, `FloatingOverlay`, `FloatingFocusManager`, `FloatingArrow`, `FloatingList`, `Composite`), and transitions + `FloatingDelayGroup`. | `forwardRef` becomes octane's ref-as-prop | No dedicated SSR/hydration tests. | 2026-07-05 |
| [`@octanejs/hook-form`](#octanejshook-form) | `react-hook-form@7.81.0` | Complete port of react-hook-form 7.81.0 (upstream commit b7df98c2) with the upstream test suite ported: `useForm`, `useController`, `useFieldArray`, `useFormState`, `useWatch`, `useFormContext`/`FormProvider`, schema resolvers, and all validation modes. | `register()` returns `onInput` (octane's native per-keystroke event) instead of React's synthetic `onChange`; mode names and `register` option keys keep the upstream spelling; Ported tests directly assert Octane's documented microtask-flush commit granularity, eager `Object.is` setState bailout, and native input-event delivery; the suite contains no skipped or expected-failure cases | Supported and tested — the upstream `*.server.test.tsx` suite runs via `octane/server` with byte-identical markup. | 2026-07-14 |
| [`@octanejs/i18next`](#octanejsi18next) | `react-i18next@17.0.9` | Complete runtime port of react-i18next 17.0.9: useTranslation, I18nextProvider/context, Trans/TransWithoutContext, IcuTrans/IcuTransWithoutContext, Translation, the withTranslation/withSSR HOCs, useSSR, namespace reporting, initialization/default helpers, and the root ICU helper exports over the unchanged i18next core. | Trans children that must be inspected are passed in prop position (`children={<>…</>}`) or through `defaults` + `components`; natural .tsrx block children are opaque compiled render bodies and fall back with a development warning; Suspense uses octane's `use(thenable)` instead of throwing a Promise; withTranslation's `withRef` option uses octane's ref-as-prop model; class components are unsupported; The React/Babel-specific `icu.macro` subpath is not shipped; the runtime IcuTrans APIs are fully supported | Preloaded renderToString output and namespace collection are covered; useSSR, withSSR, getInitialProps, and composeInitialProps are ported. A dedicated hydration differential is still open. | 2026-07-13 |
| [`@octanejs/jotai`](#octanejsjotai) | `jotai@2.20.1` | Complete 1:1 port: the framework-agnostic vanilla core (`jotai/vanilla`, `/vanilla/utils`, `/vanilla/internals`) is reused verbatim; the React layer (`Provider`, `useStore`, `useAtom`, `useAtomValue`, `useSetAtom`) and `react/utils` (`useResetAtom`, `useReducerAtom`, `useAtomCallback`, `useHydrateAtoms`) are ported onto octane hooks, preserving upstream's useReducer force-update + effect-subscription implementation, async atoms via octane's `use()`. | `jotai/babel/*` (React-specific compile-time plugins) is not shipped | No SSR-specific surface; `useHydrateAtoms` is ported and usable for hydration seeding; no dedicated SSR tests. | 2026-07-11 |
| [`@octanejs/lexical`](#octanejslexical) | `@lexical/react@0.46.0` | 35 of 39 `@lexical/react` modules ported: composer + contexts, the editable surface, plain/rich text, and the full plugin/menu set (history, lists + check-list, links, tables, markdown shortcuts, the typeahead/node-menu/context-menu family, draggable-block, character-limit, …) plus the `useLexical*` hooks. | Positioning uses `@floating-ui/dom` instead of `@floating-ui/react`; The class-based `LexicalErrorBoundary` becomes an octane error boundary; `forwardRef` becomes ref-as-prop | No dedicated SSR/hydration tests. | 2026-07-09 |
| [`@octanejs/lucide`](#octanejslucide) | `lucide-react@1.24.0` | Complete against the published `lucide-react@1.24.0` runtime surface: every canonical icon and alias, the `icons` namespace, `Icon`, `createLucideIcon`, `LucideProvider`, `useLucideContext`, `DynamicIcon`, `iconNames`, `dynamicIconImports`, and per-icon subpath imports. | Icon refs are normal Octane `ref` props rather than React `forwardRef` components; Event callbacks receive native DOM events rather than React synthetic events | Supported and tested: icons and provider defaults render through `octane/server`, and client hydration adopts the server-rendered SVG element. | 2026-07-13 |
| [`@octanejs/mdx`](#octanejsmdx) | `@mdx-js/mdx@3.1.1` | The full compile-don't-interpret pipeline: `.mdx`/`.md` → `@mdx-js/mdx` (reused verbatim) → octane compiler, via the `octaneMdx()` Vite plugin plus the `./compile` and `./server` entries; `@mdx-js/react`'s provider layer (`MDXProvider`/`useMDXComponents`) is ported onto octane context. The octane website runs on it. | `useMDXComponents` drops upstream's `useMemo` referential-stability wrapper so the call is valid in both server and client runtimes (same observable mapping) | Full SSR + hydration coverage — server-compiled documents render via `renderToString` and hydrate byte-for-byte (`ssr.test.ts`, `hydration.test.ts`). | 2026-07-07 |
| [`@octanejs/motion`](#octanejsmotion) | `motion@12.40.0` | Core surface: `motion.<tag>` (animate, gestures, variants with propagation/stagger, drag, layout basics), `AnimatePresence`, `MotionConfig`, and the motion-value hooks (`useMotionValue`, `useScroll`, `useTransform`, `useSpring`, `useAnimate`, `useMotionValueEvent`); motion-dom's animation engine and gesture primitives are reused verbatim. | Exit animations run via cleanup-before-detach instead of React's deferred-deletion machinery; `layout`/`layoutId` use single-element FLIP, not the full projection tree | No SSR-specific surface; no dedicated SSR tests. | 2026-07-06 |
| [`@octanejs/radix`](#octanejsradix) | `radix-ui@1.6.1` | Complete against the unified `radix-ui@1.6.1` component surface — all primitives (incl. Dialog, the Menu/DropdownMenu/ContextMenu family, Popover, Tooltip, Select, NavigationMenu, Toast, Menubar, Slider, the form controls, and OneTimePasswordField/PasswordToggleField) plus the composition/state/overlay foundations — verified by a differential suite (same fixtures through octane and the real radix-ui, byte-identical DOM). | `Slot`/`asChild` compose element descriptors (prop-position JSX, `createElement`, `.map()` returns), not children-position JSX; `forwardRef` becomes octane's ref-as-prop | SSR/hydration coverage for the overlay/portal components is still open (tracked in the migration plan). | 2026-07-08 |
| [`@octanejs/recharts`](#octanejsrecharts) | `recharts@3.9.2` | Partial (phases 0–1 of 5): the static `BarChart`/`LineChart` pipeline end-to-end (`isAnimationActive={false}`), byte-identical to upstream in the differential rig; the Redux/RTK state layer, `Surface`/`Layer`, and the pure shape set are in place. | Chart events coordinate through octane's native delegated events rather than React's synthetic layer | Untested; text measurement (`getStringSize`) returns 0×0 under SSR. | 2026-07-07 |
| [`@octanejs/redux`](#octanejsredux) | `react-redux@9.3.0` | The hooks + `Provider` surface of react-redux 9.3.0 (`useSelector`, `useDispatch`, `useStore`, and the custom-context factory variants) on octane's `useSyncExternalStore`; works with any Redux 5 / Redux Toolkit store. Export parity is pinned by test. | `connect()` (the legacy HOC surface) intentionally throws — the hooks API is the supported surface; Error messages are octane-branded | No SSR-specific surface; no dedicated SSR tests. | 2026-07-08 |
| [`@octanejs/redux-toolkit`](#octanejsredux-toolkit) | `@reduxjs/toolkit@2.12.0` | Complete four-entry-point port: the framework-agnostic Toolkit and RTK Query core are re-exported verbatim; `/query/react` provides generated query, lazy-query, mutation, infinite-query, prefetch hooks and `ApiProvider`; `/react` provides the dynamic-middleware dispatch-hook integration. | The compatibility `/react` subpaths and `reactHooksModule` names are retained, but use octane and `@octanejs/redux` internally; `useDebugValue` is octane's no-op compatibility hook; observable query behavior is unchanged | Preloaded RTK Query state renders through the traditional @octanejs/redux Provider; effects and browser listeners remain client-only. Dedicated SSR and hydration tests are included. | 2026-07-13 |
| [`@octanejs/remix-router`](#octanejsremix-router) | `react-router@8.2.0` | COMPLETE port (all phases shipped — full export parity, EXPECTED_MISSING is empty): the framework-agnostic router core (lib/router/* + framework-free helpers, ~12k lines) is vendored byte-close and validated by 161 ported upstream router tests plus four focused v8.2 regression pins; the data-mode React layer (createMemoryRouter, RouterProvider incl. the /dom flushSync variant, Outlet, Await, RenderErrorBoundary/errorElement, Link + useLinkClickHandler, and the full read-hook family) and the declarative layer (MemoryRouter, Routes/Route in BOTH children forms — descriptor children walked upstream-style, .tsrx block children via a registration collector — Navigate, createRoutesFromChildren/Elements, the UNSAFE_With*Props wrappers) and the DOM layer (createBrowserRouter/createHashRouter with __staticRouterHydrationData parsing, BrowserRouter/HashRouter/unstable_HistoryRouter, Link + NavLink incl. the isActive/isPending render props, useLinkClickHandler, useSearchParams) and the mutation layer (Form on octane's native delegated submit event, useSubmit incl. JSON encTypes, useFormAction with ?index resolution, useFetcher/useFetchers incl. fetcher.Form/load/submit/reset and shared keys), the guard/scroll layer (useBlocker, unstable_usePrompt, ScrollRestoration/UNSAFE_useScrollRestoration, useBeforeUnload, useViewTransitionState, unstable_useRoute/unstable_useRouterState), static SSR (StaticRouter, StaticRouterProvider, createStaticHandler/createStaticRouter rendering through octane/server — markup byte-identical to react-dom/server after marker stripping, hydration payload identical), and the vendored cookie/session server runtime (createCookie/createSession/createCookieSessionStorage/createMemorySessionStorage) are transcribed onto octane and differential-verified against real react-router. Framework-mode + RSC names (Meta/Links/Scripts, createRequestHandler, UNSAFE_ internals) exist as THROWING STUBS so parity is honest. | Refs are props (octane has no forwardRef) — Link's forwardRef becomes a `ref` prop; Error-boundary reset on location change / revalidation-idle happens in a layout effect one commit after upstream's render-phase derivation — same observable outcome; octane's flushSync inside an ambient flush degrades to a plain call drained at that flush's boundary (sync scroll/navigation notifies from within event handlers land at the flush boundary instead of nested) — consumer-invisible, conformance-pinned; Form's onSubmit is a NATIVE delegated submit listener (octane has no synthetic events): `event.submitter` is read directly off the SubmitEvent where React reads `event.nativeEvent.submitter` — same value, differential-verified; Block-children `<Routes>` collects `<Route>`s by registration (mount order) instead of upstream's element-children walk (source order) — a conditionally-mounted `<Route>` between static siblings registers after them, which only affects matchRoutes score TIES; conformance-pinned | Shipped: StaticRouter/StaticRouterProvider/createStaticHandler/createStaticRouter render through octane/server (remix-router-ssr vitest project compiles the whole graph in server mode; markup matches react-dom/server byte-for-byte after framework-marker stripping). Block-children <Routes> is CLIENT-only (the registration collector runs in layout effects) — use descriptor children or route objects for SSR. | 2026-07-13 |
| [`@octanejs/sonner`](#octanejssonner) | `sonner@2.0.7` | Complete against the published `sonner@2.0.7` public surface: `Toaster`, the callable `toast` API and all methods, `useSonner`, promise lifecycle, multiple toaster targeting, stacked layout, themes, styling, focus management, timers, and swipe dismissal. | Action callbacks receive native DOM `MouseEvent`s rather than React synthetic events; `Toaster` accepts its ref as a normal prop instead of using `forwardRef`; The document-visibility hook is guarded during SSR; upstream 2.0.7 reads `document.hidden` during render | Supported and tested: `Toaster` server-renders without browser globals, hydrates by adopting the server host, and can show the first client-created toast without replacing it. | 2026-07-13 |
| [`@octanejs/stylex`](#octanejsstylex) | `@stylexjs/stylex@0.19.0` | Full compile-time integration: re-exports the StyleX runtime API (`create`, `props`, `attrs`, `keyframes`, `defineVars`, `createTheme`) and registers as an import source; the `/vite` plugin runs the StyleX compiler over octane's compiled output and emits one static atomic stylesheet (`virtual:stylex.css`) with zero StyleX runtime in the bundle. | The `sx` JSX prop is not supported — spread `{...stylex.props(...)}` instead; The compiler runs over octane's compiled output rather than source, so StyleX's own PostCSS source-scanning setup is unused | Works under SSR — the stylesheet is static and server markup carries the final class names; no dedicated SSR test files. | 2026-07-09 |
| [`@octanejs/tanstack-query`](#octanejstanstack-query) | `@tanstack/react-query@5.101.0` | Complete: 58/58 runtime exports plus the full TypeScript surface; the export surface is byte-identical to upstream in both directions (locked by test), and `@tanstack/query-core` is re-exported verbatim. | Suspense integrates via octane's `use(thenable)` rather than throwing a promise (observable behavior matches) | `HydrationBoundary` fully ported (incl. streaming `promise`/`dehydratedAt` re-hydration); the SSR/streaming server entries and server-render tests are still open. | 2026-07-06 |
| [`@octanejs/tanstack-router`](#octanejstanstack-router) | `@tanstack/react-router@1.170.16` | Code-based routing at full binding parity (2026-07-06 gap-closure sweep): the full Match pipeline, router lifecycle events, the complete read-hook family, full-parity `Link` (preloading, masking, `activeProps`), `useBlocker`/`Block`, `Await`/`defer`, scroll restoration, lazy routes, not-found handling, and search-param validation/middleware — differential-verified byte-equal vs the real `@tanstack/react-router`. | Refs are props — `createLink`'s `forwardRef` becomes a `ref` prop; No `flushSync` in the `Link` click handler; navigation state updates run synchronously | SSR entries (`RouterServer`/`RouterClient`, `HeadContent`/`Scripts`) not yet ported; no SSR tests. | 2026-07-06 |
| [`@octanejs/tanstack-store`](#octanejstanstack-store) | `@tanstack/react-store@0.11.0` | Re-exports `@tanstack/store@0.11.0` unchanged and implements the stable React binding surface (`useSelector`, `useAtom`, `useCreateAtom`, `useCreateStore`, `createStoreContext`, and deprecated `useStore`) on Octane hooks. | The upstream experimental `_useStore` hook is intentionally omitted; use `useSelector` with `store.actions` or `store.setState` instead | Supported: selectors, writable atoms, and store context read their current snapshots during server rendering; the adapter has no browser-only initialization. | 2026-07-15 |
| [`@octanejs/tanstack-table`](#octanejstanstack-table) | `@tanstack/react-table@8.21.3` | Complete 1:1 port: the framework-agnostic `@tanstack/table-core` (createTable + all feature row models) is reused verbatim; the ~100-line React adapter (`useReactTable`, `flexRender`) is transcribed onto octane hooks, preserving upstream's useState-based state wiring. | `flexRender`'s class-component and `react.memo`/`forwardRef` exotic-component branches are dropped — octane has no class components or forwardRef, and octane's `memo()` returns a plain function, so `typeof === 'function'` covers every component | No SSR-specific surface; table-core is pure computation. | 2026-07-11 |
| [`@octanejs/tanstack-virtual`](#octanejstanstack-virtual) | `@tanstack/react-virtual@3.14.5` | Complete 1:1 port: the framework-agnostic `@tanstack/virtual-core` (Virtualizer + observers + windowing math) is reused verbatim; the React adapter (`useVirtualizer`, `useWindowVirtualizer`, incl. `useFlushSync` and the experimental `directDomUpdates` surface) is transcribed onto octane hooks, preserving upstream's force-update + flushSync-on-sync-scroll wiring and layout-effect lifecycle. | octane's `flushSync` called while a flush is already on the stack degrades to a plain call drained by the ambient flush (re-entrancy guard) — sync scroll notifies dispatched from inside a discrete-event flush land at that flush's boundary instead of nested; consumer-invisible, pinned by a conformance test | SSR-safe: `useIsomorphicLayoutEffect` degrades to `useEffect` without `document`; the first paint windows from `initialRect`/`initialOffset` exactly as upstream. No dedicated SSR tests. | 2026-07-12 |
| [`@octanejs/testing-library`](#octanejstesting-library) | `@testing-library/react` (unpinned) | `render`/`rerender`/`cleanup`/`renderHook` + `act` over the verbatim `@testing-library/dom` (every query, `screen`, `within`, `waitFor`, `fireEvent`, `prettyDOM`, `configure`), with commit timing wired to octane's scheduler via the dom-library's `eventWrapper`/`asyncWrapper` config. | `fireEvent` dispatches real native events — no React remappings (`fireEvent.change` fires a native `change`, not `input`) and no enter/leave/focus double-dispatch; Not ported: the `ReactStrictMode` wrapper, `legacyRoot`, and the `onCaughtError`/`onRecoverableError` options | `hydrate: true` adopts octane SSR output via `hydrateRoot`. | 2026-07-09 |
| [`@octanejs/zustand`](#octanejszustand) | `zustand@5.0.14` | Complete 1:1 port: the framework-agnostic vanilla store is reused verbatim; `create`/`useStore`, `shallow`/`useShallow`, the traditional equality-fn variants, and all middleware (persist, devtools, subscribeWithSelector, combine, redux). | Unstable selectors (a new reference every render) settle after a bounded number of re-renders instead of hitting React's `useSyncExternalStore` warning loop — still prefer `useShallow` | No SSR-specific surface; no dedicated SSR tests. | 2026-07-06 |

## @octanejs/apollo-client

[`packages/apollo-client`](../packages/apollo-client) `0.1.1` — ports `@apollo/client@4.2.6`. Status data: [`packages/apollo-client/status.json`](../packages/apollo-client/status.json).

Complete published client adapter surface: all 18 @apollo/client/react runtime exports and their Apollo 4.2.6 TypeScript declarations, plus the framework-neutral root/testing exports and an Octane MockedProvider.

Known divergences:

- Suspense unwraps stable Apollo promises through Octane use() instead of React's use() or a thrown-promise fallback.
- The React class-based MockedProvider is an equivalent Octane function component.
- React Server Components and Apollo's React Compiler-generated entry are intentionally not exposed.

SSR / hydration: Core hooks use Octane's server hook implementations, but Apollo's multi-pass non-Suspense query prepass, cache extraction/restore integration, and dedicated SSR/hydration tests remain open.

Scope/evidence last checked: 2026-07-14.

See also: [`docs/apollo-client-port-plan.md`](apollo-client-port-plan.md)

## @octanejs/base-ui

[`packages/base-ui`](../packages/base-ui) `0.1.4` — ports `@base-ui/react@1.6.0`. Status data: [`packages/base-ui/status.json`](../packages/base-ui/status.json).

Alpha, in progress: the foundation + overlay infrastructure and the first component set (Dialog, AlertDialog, Popover open-path) landed, ported at full fidelity and differential-verified against the real `@base-ui/react`.

Known divergences:

- Handlers receive native DOM events (no synthetic layer).
- `forwardRef` becomes ref-as-prop; `className` composes via octane's `normalizeClass` (the render-prop string merge matches Base UI exactly).

SSR / hydration: No dedicated SSR/hydration tests yet.

Scope/evidence last checked: 2026-07-08.

See also: [`docs/base-ui-migration-plan.md`](base-ui-migration-plan.md)

## @octanejs/dnd-kit

[`packages/dnd-kit`](../packages/dnd-kit) `0.1.1` — ports `@dnd-kit/react@0.5.0`. Status data: [`packages/dnd-kit/status.json`](../packages/dnd-kit/status.json).

Complete modern dnd-kit React-adapter surface: DragDropProvider, DragOverlay, useDraggable/useDroppable, manager/monitor/operation hooks, PointerSensor/KeyboardSensor re-exports, the public signal-hook utilities, useSortable, and all four upstream entry points.

Known divergences:

- DragOverlay distinguishes octane compiled children blocks from function render props; ordinary typed usage is behaviorally equivalent.

SSR / hydration: Static SSR and hydration are covered; DOM plugins initialize only after client refs register.

Scope/evidence last checked: 2026-07-13.

- Targets the modern @dnd-kit/react API. The legacy @dnd-kit/core 6.x API is intentionally out of scope.

## @octanejs/floating-ui

[`packages/floating-ui`](../packages/floating-ui) `0.1.5` — ports `@floating-ui/react@0.27.19`. Status data: [`packages/floating-ui/status.json`](../packages/floating-ui/status.json).

Positioning (`useFloating`, ref-aware `arrow`, the `@floating-ui/dom` middleware re-exports, the floating tree), the full interaction-hook set (`useInteractions`, `useHover` + `safePolygon`, `useClick`, `useFocus`, `useDismiss`, `useRole`, `useClientPoint`, `useListNavigation`, `useTypeahead`), the component layer (`FloatingPortal`, `FloatingOverlay`, `FloatingFocusManager`, `FloatingArrow`, `FloatingList`, `Composite`), and transitions + `FloatingDelayGroup`.

Known divergences:

- `forwardRef` becomes octane's ref-as-prop.

SSR / hydration: No dedicated SSR/hydration tests.

Scope/evidence last checked: 2026-07-05.

- Not yet ported: the `inner`/`useInnerOffset` middleware pair.

## @octanejs/hook-form

[`packages/hook-form`](../packages/hook-form) `0.1.3` — ports `react-hook-form@7.81.0`. Status data: [`packages/hook-form/status.json`](../packages/hook-form/status.json).

Complete port of react-hook-form 7.81.0 (upstream commit b7df98c2) with the upstream test suite ported: `useForm`, `useController`, `useFieldArray`, `useFormState`, `useWatch`, `useFormContext`/`FormProvider`, schema resolvers, and all validation modes.

Known divergences:

- `register()` returns `onInput` (octane's native per-keystroke event) instead of React's synthetic `onChange`; mode names and `register` option keys keep the upstream spelling.
- Ported tests directly assert Octane's documented microtask-flush commit granularity, eager `Object.is` setState bailout, and native input-event delivery; the suite contains no skipped or expected-failure cases.

SSR / hydration: Supported and tested — the upstream `*.server.test.tsx` suite runs via `octane/server` with byte-identical markup.

Scope/evidence last checked: 2026-07-14.

See also: [`docs/octanejs-hook-form-plan.md`](octanejs-hook-form-plan.md)

## @octanejs/i18next

[`packages/i18next`](../packages/i18next) `0.1.1` — ports `react-i18next@17.0.9`. Status data: [`packages/i18next/status.json`](../packages/i18next/status.json).

Complete runtime port of react-i18next 17.0.9: useTranslation, I18nextProvider/context, Trans/TransWithoutContext, IcuTrans/IcuTransWithoutContext, Translation, the withTranslation/withSSR HOCs, useSSR, namespace reporting, initialization/default helpers, and the root ICU helper exports over the unchanged i18next core.

Known divergences:

- Trans children that must be inspected are passed in prop position (`children={<>…</>}`) or through `defaults` + `components`; natural .tsrx block children are opaque compiled render bodies and fall back with a development warning.
- Suspense uses octane's `use(thenable)` instead of throwing a Promise.
- withTranslation's `withRef` option uses octane's ref-as-prop model; class components are unsupported.
- The React/Babel-specific `icu.macro` subpath is not shipped; the runtime IcuTrans APIs are fully supported.

SSR / hydration: Preloaded renderToString output and namespace collection are covered; useSSR, withSSR, getInitialProps, and composeInitialProps are ported. A dedicated hydration differential is still open.

Scope/evidence last checked: 2026-07-13.

## @octanejs/jotai

[`packages/jotai`](../packages/jotai) `0.1.3` — ports `jotai@2.20.1`. Status data: [`packages/jotai/status.json`](../packages/jotai/status.json).

Complete 1:1 port: the framework-agnostic vanilla core (`jotai/vanilla`, `/vanilla/utils`, `/vanilla/internals`) is reused verbatim; the React layer (`Provider`, `useStore`, `useAtom`, `useAtomValue`, `useSetAtom`) and `react/utils` (`useResetAtom`, `useReducerAtom`, `useAtomCallback`, `useHydrateAtoms`) are ported onto octane hooks, preserving upstream's useReducer force-update + effect-subscription implementation, async atoms via octane's `use()`.

Known divergences:

- `jotai/babel/*` (React-specific compile-time plugins) is not shipped.

SSR / hydration: No SSR-specific surface; `useHydrateAtoms` is ported and usable for hydration seeding; no dedicated SSR tests.

Scope/evidence last checked: 2026-07-11.

## @octanejs/lexical

[`packages/lexical`](../packages/lexical) `0.1.5` — ports `@lexical/react@0.46.0`. Status data: [`packages/lexical/status.json`](../packages/lexical/status.json).

35 of 39 `@lexical/react` modules ported: composer + contexts, the editable surface, plain/rich text, and the full plugin/menu set (history, lists + check-list, links, tables, markdown shortcuts, the typeahead/node-menu/context-menu family, draggable-block, character-limit, …) plus the `useLexical*` hooks.

Known divergences:

- Positioning uses `@floating-ui/dom` instead of `@floating-ui/react`.
- The class-based `LexicalErrorBoundary` becomes an octane error boundary; `forwardRef` becomes ref-as-prop.

SSR / hydration: No dedicated SSR/hydration tests.

Scope/evidence last checked: 2026-07-09.

- Not ported (4 modules, with reasons): `LexicalCollaborationPlugin` (real-time Yjs collaboration needs a two-peer harness), `LexicalExtensionComposer`/`LexicalExtensionEditorComposer` (the newer extension API wraps a React-only subsystem), and `LexicalTreeView` (wraps the `@lexical/devtools-core` React component).

## @octanejs/lucide

[`packages/lucide`](../packages/lucide) `0.1.1` — ports `lucide-react@1.24.0`. Status data: [`packages/lucide/status.json`](../packages/lucide/status.json).

Complete against the published `lucide-react@1.24.0` runtime surface: every canonical icon and alias, the `icons` namespace, `Icon`, `createLucideIcon`, `LucideProvider`, `useLucideContext`, `DynamicIcon`, `iconNames`, `dynamicIconImports`, and per-icon subpath imports.

Known divergences:

- Icon refs are normal Octane `ref` props rather than React `forwardRef` components.
- Event callbacks receive native DOM events rather than React synthetic events.

SSR / hydration: Supported and tested: icons and provider defaults render through `octane/server`, and client hydration adopts the server-rendered SVG element.

Scope/evidence last checked: 2026-07-13.

- Generated wrappers consume official framework-neutral `@lucide/icons@1.24.0` data, so SVG geometry is not copied or maintained by the port.
- Generation checks pin the React export, alias, and dynamic-name surfaces and reject stale generated files.

See also: [`docs/lucide-port-plan.md`](lucide-port-plan.md)

## @octanejs/mdx

[`packages/mdx`](../packages/mdx) `0.1.3` — ports `@mdx-js/mdx@3.1.1`. Status data: [`packages/mdx/status.json`](../packages/mdx/status.json).

The full compile-don't-interpret pipeline: `.mdx`/`.md` → `@mdx-js/mdx` (reused verbatim) → octane compiler, via the `octaneMdx()` Vite plugin plus the `./compile` and `./server` entries; `@mdx-js/react`'s provider layer (`MDXProvider`/`useMDXComponents`) is ported onto octane context. The octane website runs on it.

Known divergences:

- `useMDXComponents` drops upstream's `useMemo` referential-stability wrapper so the call is valid in both server and client runtimes (same observable mapping).

SSR / hydration: Full SSR + hydration coverage — server-compiled documents render via `renderToString` and hydrate byte-for-byte (`ssr.test.ts`, `hydration.test.ts`).

Scope/evidence last checked: 2026-07-07.

See also: [`docs/mdx-migration-plan.md`](mdx-migration-plan.md)

## @octanejs/motion

[`packages/motion`](../packages/motion) `0.1.5` — ports `motion@12.40.0`. Status data: [`packages/motion/status.json`](../packages/motion/status.json).

Core surface: `motion.<tag>` (animate, gestures, variants with propagation/stagger, drag, layout basics), `AnimatePresence`, `MotionConfig`, and the motion-value hooks (`useMotionValue`, `useScroll`, `useTransform`, `useSpring`, `useAnimate`, `useMotionValueEvent`); motion-dom's animation engine and gesture primitives are reused verbatim.

Known divergences:

- Exit animations run via cleanup-before-detach instead of React's deferred-deletion machinery.
- `layout`/`layoutId` use single-element FLIP, not the full projection tree.

SSR / hydration: No SSR-specific surface; no dedicated SSR tests.

Scope/evidence last checked: 2026-07-06.

- Not yet ported: nested/shared layout projection (incl. child scale correction and shared layout during drag), drag momentum + elastic physics, reduced-motion enforcement, the `useTransform` output-map form, and `when: 'beforeChildren' | 'afterChildren'` sequencing.

## @octanejs/radix

[`packages/radix`](../packages/radix) `0.1.5` — ports `radix-ui@1.6.1`. Status data: [`packages/radix/status.json`](../packages/radix/status.json).

Complete against the unified `radix-ui@1.6.1` component surface — all primitives (incl. Dialog, the Menu/DropdownMenu/ContextMenu family, Popover, Tooltip, Select, NavigationMenu, Toast, Menubar, Slider, the form controls, and OneTimePasswordField/PasswordToggleField) plus the composition/state/overlay foundations — verified by a differential suite (same fixtures through octane and the real radix-ui, byte-identical DOM).

Known divergences:

- `Slot`/`asChild` compose element descriptors (prop-position JSX, `createElement`, `.map()` returns), not children-position JSX.
- `forwardRef` becomes octane's ref-as-prop.

SSR / hydration: SSR/hydration coverage for the overlay/portal components is still open (tracked in the migration plan).

Scope/evidence last checked: 2026-07-08.

See also: [`docs/radix-migration-plan.md`](radix-migration-plan.md)

## @octanejs/recharts

[`packages/recharts`](../packages/recharts) `0.1.3` — ports `recharts@3.9.2`. Status data: [`packages/recharts/status.json`](../packages/recharts/status.json).

Partial (phases 0–1 of 5): the static `BarChart`/`LineChart` pipeline end-to-end (`isAnimationActive={false}`), byte-identical to upstream in the differential rig; the Redux/RTK state layer, `Surface`/`Layer`, and the pure shape set are in place.

Known divergences:

- Chart events coordinate through octane's native delegated events rather than React's synthetic layer.

SSR / hydration: Untested; text measurement (`getStringSize`) returns 0×0 under SSR.

Scope/evidence last checked: 2026-07-07.

- Planned next (phases 2–5): `Tooltip`/`Legend`/`ResponsiveContainer`, the remaining cartesian charts, polar charts, and animation + chart sync. Target surface: 97 runtime + 78 type exports.

See also: [`docs/recharts-port-plan.md`](recharts-port-plan.md)

## @octanejs/redux

[`packages/redux`](../packages/redux) `0.1.3` — ports `react-redux@9.3.0`. Status data: [`packages/redux/status.json`](../packages/redux/status.json).

The hooks + `Provider` surface of react-redux 9.3.0 (`useSelector`, `useDispatch`, `useStore`, and the custom-context factory variants) on octane's `useSyncExternalStore`; works with any Redux 5 / Redux Toolkit store. Export parity is pinned by test.

Known divergences:

- `connect()` (the legacy HOC surface) intentionally throws — the hooks API is the supported surface.
- Error messages are octane-branded.

SSR / hydration: No SSR-specific surface; no dedicated SSR tests.

Scope/evidence last checked: 2026-07-08.

## @octanejs/redux-toolkit

[`packages/redux-toolkit`](../packages/redux-toolkit) `0.1.1` — ports `@reduxjs/toolkit@2.12.0`. Status data: [`packages/redux-toolkit/status.json`](../packages/redux-toolkit/status.json).

Complete four-entry-point port: the framework-agnostic Toolkit and RTK Query core are re-exported verbatim; `/query/react` provides generated query, lazy-query, mutation, infinite-query, prefetch hooks and `ApiProvider`; `/react` provides the dynamic-middleware dispatch-hook integration.

Known divergences:

- The compatibility `/react` subpaths and `reactHooksModule` names are retained, but use octane and `@octanejs/redux` internally.
- `useDebugValue` is octane's no-op compatibility hook; observable query behavior is unchanged.

SSR / hydration: Preloaded RTK Query state renders through the traditional @octanejs/redux Provider; effects and browser listeners remain client-only. Dedicated SSR and hydration tests are included.

Scope/evidence last checked: 2026-07-13.

## @octanejs/remix-router

[`packages/remix-router`](../packages/remix-router) `0.1.2` — ports `react-router@8.2.0`. Status data: [`packages/remix-router/status.json`](../packages/remix-router/status.json).

COMPLETE port (all phases shipped — full export parity, EXPECTED_MISSING is empty): the framework-agnostic router core (lib/router/* + framework-free helpers, ~12k lines) is vendored byte-close and validated by 161 ported upstream router tests plus four focused v8.2 regression pins; the data-mode React layer (createMemoryRouter, RouterProvider incl. the /dom flushSync variant, Outlet, Await, RenderErrorBoundary/errorElement, Link + useLinkClickHandler, and the full read-hook family) and the declarative layer (MemoryRouter, Routes/Route in BOTH children forms — descriptor children walked upstream-style, .tsrx block children via a registration collector — Navigate, createRoutesFromChildren/Elements, the UNSAFE_With*Props wrappers) and the DOM layer (createBrowserRouter/createHashRouter with __staticRouterHydrationData parsing, BrowserRouter/HashRouter/unstable_HistoryRouter, Link + NavLink incl. the isActive/isPending render props, useLinkClickHandler, useSearchParams) and the mutation layer (Form on octane's native delegated submit event, useSubmit incl. JSON encTypes, useFormAction with ?index resolution, useFetcher/useFetchers incl. fetcher.Form/load/submit/reset and shared keys), the guard/scroll layer (useBlocker, unstable_usePrompt, ScrollRestoration/UNSAFE_useScrollRestoration, useBeforeUnload, useViewTransitionState, unstable_useRoute/unstable_useRouterState), static SSR (StaticRouter, StaticRouterProvider, createStaticHandler/createStaticRouter rendering through octane/server — markup byte-identical to react-dom/server after marker stripping, hydration payload identical), and the vendored cookie/session server runtime (createCookie/createSession/createCookieSessionStorage/createMemorySessionStorage) are transcribed onto octane and differential-verified against real react-router. Framework-mode + RSC names (Meta/Links/Scripts, createRequestHandler, UNSAFE_ internals) exist as THROWING STUBS so parity is honest.

Known divergences:

- Refs are props (octane has no forwardRef) — Link's forwardRef becomes a `ref` prop.
- Error-boundary reset on location change / revalidation-idle happens in a layout effect one commit after upstream's render-phase derivation — same observable outcome.
- octane's flushSync inside an ambient flush degrades to a plain call drained at that flush's boundary (sync scroll/navigation notifies from within event handlers land at the flush boundary instead of nested) — consumer-invisible, conformance-pinned.
- Form's onSubmit is a NATIVE delegated submit listener (octane has no synthetic events): `event.submitter` is read directly off the SubmitEvent where React reads `event.nativeEvent.submitter` — same value, differential-verified.
- Block-children `<Routes>` collects `<Route>`s by registration (mount order) instead of upstream's element-children walk (source order) — a conditionally-mounted `<Route>` between static siblings registers after them, which only affects matchRoutes score TIES; conformance-pinned.

SSR / hydration: Shipped: StaticRouter/StaticRouterProvider/createStaticHandler/createStaticRouter render through octane/server (remix-router-ssr vitest project compiles the whole graph in server mode; markup matches react-dom/server byte-for-byte after framework-marker stripping). Block-children <Routes> is CLIENT-only (the registration collector runs in layout effects) — use descriptor children or route objects for SSR.

Scope/evidence last checked: 2026-07-13.

- Full export parity: tests/conformance/parity.test.ts pins EXPECTED_MISSING at []. Framework mode (needs @react-router/dev) and RSC are permanently out of scope — those names are throwing stubs with scope-policy messages. The cookie/session server runtime is vendored (adds the `cookie-es` dependency, as upstream). React Router 8 removes react-router-dom, makes middleware unconditional, and removes hasErrorBoundary plus the v8 future flags.

See also: [`docs/remix-router-port-plan.md`](remix-router-port-plan.md)

## @octanejs/sonner

[`packages/sonner`](../packages/sonner) `0.1.1` — ports `sonner@2.0.7`. Status data: [`packages/sonner/status.json`](../packages/sonner/status.json).

Complete against the published `sonner@2.0.7` public surface: `Toaster`, the callable `toast` API and all methods, `useSonner`, promise lifecycle, multiple toaster targeting, stacked layout, themes, styling, focus management, timers, and swipe dismissal.

Known divergences:

- Action callbacks receive native DOM `MouseEvent`s rather than React synthetic events.
- `Toaster` accepts its ref as a normal prop instead of using `forwardRef`.
- The document-visibility hook is guarded during SSR; upstream 2.0.7 reads `document.hidden` during render.

SSR / hydration: Supported and tested: `Toaster` server-renders without browser globals, hydrates by adopting the server host, and can show the first client-created toast without replacing it.

Scope/evidence last checked: 2026-07-13.

See also: [`docs/sonner-port-plan.md`](sonner-port-plan.md)

## @octanejs/stylex

[`packages/stylex`](../packages/stylex) `0.1.5` — ports `@stylexjs/stylex@0.19.0`. Status data: [`packages/stylex/status.json`](../packages/stylex/status.json).

Full compile-time integration: re-exports the StyleX runtime API (`create`, `props`, `attrs`, `keyframes`, `defineVars`, `createTheme`) and registers as an import source; the `/vite` plugin runs the StyleX compiler over octane's compiled output and emits one static atomic stylesheet (`virtual:stylex.css`) with zero StyleX runtime in the bundle.

Known divergences:

- The `sx` JSX prop is not supported — spread `{...stylex.props(...)}` instead.
- The compiler runs over octane's compiled output rather than source, so StyleX's own PostCSS source-scanning setup is unused.

SSR / hydration: Works under SSR — the stylesheet is static and server markup carries the final class names; no dedicated SSR test files.

Scope/evidence last checked: 2026-07-09.

## @octanejs/tanstack-query

[`packages/tanstack-query`](../packages/tanstack-query) `0.1.5` — ports `@tanstack/react-query@5.101.0`. Status data: [`packages/tanstack-query/status.json`](../packages/tanstack-query/status.json).

Complete: 58/58 runtime exports plus the full TypeScript surface; the export surface is byte-identical to upstream in both directions (locked by test), and `@tanstack/query-core` is re-exported verbatim.

Known divergences:

- Suspense integrates via octane's `use(thenable)` rather than throwing a promise (observable behavior matches).

SSR / hydration: `HydrationBoundary` fully ported (incl. streaming `promise`/`dehydratedAt` re-hydration); the SSR/streaming server entries and server-render tests are still open.

Scope/evidence last checked: 2026-07-06.

See also: [`docs/tanstack-parity-audit.md`](tanstack-parity-audit.md)

## @octanejs/tanstack-router

[`packages/tanstack-router`](../packages/tanstack-router) `0.1.5` — ports `@tanstack/react-router@1.170.16`. Status data: [`packages/tanstack-router/status.json`](../packages/tanstack-router/status.json).

Code-based routing at full binding parity (2026-07-06 gap-closure sweep): the full Match pipeline, router lifecycle events, the complete read-hook family, full-parity `Link` (preloading, masking, `activeProps`), `useBlocker`/`Block`, `Await`/`defer`, scroll restoration, lazy routes, not-found handling, and search-param validation/middleware — differential-verified byte-equal vs the real `@tanstack/react-router`.

Known divergences:

- Refs are props — `createLink`'s `forwardRef` becomes a `ref` prop.
- No `flushSync` in the `Link` click handler; navigation state updates run synchronously.

SSR / hydration: SSR entries (`RouterServer`/`RouterClient`, `HeadContent`/`Scripts`) not yet ported; no SSR tests.

Scope/evidence last checked: 2026-07-06.

- Still open: file-based routing + the codegen plugin, devtools, and the typed public surface (factories/hooks are still `any`).

See also: [`docs/tanstack-parity-audit.md`](tanstack-parity-audit.md)

## @octanejs/tanstack-store

[`packages/tanstack-store`](../packages/tanstack-store) `0.0.1` — ports `@tanstack/react-store@0.11.0`. Status data: [`packages/tanstack-store/status.json`](../packages/tanstack-store/status.json).

Re-exports `@tanstack/store@0.11.0` unchanged and implements the stable React binding surface (`useSelector`, `useAtom`, `useCreateAtom`, `useCreateStore`, `createStoreContext`, and deprecated `useStore`) on Octane hooks.

Known divergences:

- The upstream experimental `_useStore` hook is intentionally omitted; use `useSelector` with `store.actions` or `store.setState` instead.

SSR / hydration: Supported: selectors, writable atoms, and store context read their current snapshots during server rendering; the adapter has no browser-only initialization.

Scope/evidence last checked: 2026-07-15.

- Differential coverage runs one shared fixture through this adapter and real `@tanstack/react-store@0.11.0`, covering selectors, comparator bailouts, atom writes, component-created atoms and stores, actions, and context.
- Behavioral conformance coverage additionally checks source replacement, independent call sites, nested provider resolution, subscription cleanup, deprecated `useStore`, and server output; type tests cover all overload families.

## @octanejs/tanstack-table

[`packages/tanstack-table`](../packages/tanstack-table) `0.1.3` — ports `@tanstack/react-table@8.21.3`. Status data: [`packages/tanstack-table/status.json`](../packages/tanstack-table/status.json).

Complete 1:1 port: the framework-agnostic `@tanstack/table-core` (createTable + all feature row models) is reused verbatim; the ~100-line React adapter (`useReactTable`, `flexRender`) is transcribed onto octane hooks, preserving upstream's useState-based state wiring.

Known divergences:

- `flexRender`'s class-component and `react.memo`/`forwardRef` exotic-component branches are dropped — octane has no class components or forwardRef, and octane's `memo()` returns a plain function, so `typeof === 'function'` covers every component.

SSR / hydration: No SSR-specific surface; table-core is pure computation.

Scope/evidence last checked: 2026-07-11.

- Column sizing/resizing and pinning/ordering drag interactions are untested-by-interaction (the differential rig has no mousemove driver); their state APIs are table-core computation reused verbatim.

## @octanejs/tanstack-virtual

[`packages/tanstack-virtual`](../packages/tanstack-virtual) `0.1.3` — ports `@tanstack/react-virtual@3.14.5`. Status data: [`packages/tanstack-virtual/status.json`](../packages/tanstack-virtual/status.json).

Complete 1:1 port: the framework-agnostic `@tanstack/virtual-core` (Virtualizer + observers + windowing math) is reused verbatim; the React adapter (`useVirtualizer`, `useWindowVirtualizer`, incl. `useFlushSync` and the experimental `directDomUpdates` surface) is transcribed onto octane hooks, preserving upstream's force-update + flushSync-on-sync-scroll wiring and layout-effect lifecycle.

Known divergences:

- octane's `flushSync` called while a flush is already on the stack degrades to a plain call drained by the ambient flush (re-entrancy guard) — sync scroll notifies dispatched from inside a discrete-event flush land at that flush's boundary instead of nested; consumer-invisible, pinned by a conformance test.

SSR / hydration: SSR-safe: `useIsomorphicLayoutEffect` degrades to `useEffect` without `document`; the first paint windows from `initialRect`/`initialOffset` exactly as upstream. No dedicated SSR tests.

Scope/evidence last checked: 2026-07-12.

- Smooth scrolling (`behavior: 'smooth'`) and the default ResizeObserver measurement path are untestable in jsdom (no layout); their code is verbatim upstream/virtual-core. Tests drive rects via the public `initialRect`/`observeElementRect`/`measureElement` options, mirroring upstream's own harness.

## @octanejs/testing-library

[`packages/testing-library`](../packages/testing-library) `0.1.3` — ports `@testing-library/react` (unpinned). Status data: [`packages/testing-library/status.json`](../packages/testing-library/status.json).

`render`/`rerender`/`cleanup`/`renderHook` + `act` over the verbatim `@testing-library/dom` (every query, `screen`, `within`, `waitFor`, `fireEvent`, `prettyDOM`, `configure`), with commit timing wired to octane's scheduler via the dom-library's `eventWrapper`/`asyncWrapper` config.

Known divergences:

- `fireEvent` dispatches real native events — no React remappings (`fireEvent.change` fires a native `change`, not `input`) and no enter/leave/focus double-dispatch.
- Not ported: the `ReactStrictMode` wrapper, `legacyRoot`, and the `onCaughtError`/`onRecoverableError` options.

SSR / hydration: `hydrate: true` adopts octane SSR output via `hydrateRoot`.

Scope/evidence last checked: 2026-07-09.

- The reused framework-agnostic core is `@testing-library/dom@^10.4.1`; the ported react-testing-library layer tracks upstream behavior rather than a pinned release.

See also: [`docs/testing-library-migration-plan.md`](testing-library-migration-plan.md)

## @octanejs/zustand

[`packages/zustand`](../packages/zustand) `0.1.5` — ports `zustand@5.0.14`. Status data: [`packages/zustand/status.json`](../packages/zustand/status.json).

Complete 1:1 port: the framework-agnostic vanilla store is reused verbatim; `create`/`useStore`, `shallow`/`useShallow`, the traditional equality-fn variants, and all middleware (persist, devtools, subscribeWithSelector, combine, redux).

Known divergences:

- Unstable selectors (a new reference every render) settle after a bounded number of re-renders instead of hitting React's `useSyncExternalStore` warning loop — still prefer `useShallow`.

SSR / hydration: No SSR-specific surface; no dedicated SSR tests.

Scope/evidence last checked: 2026-07-06.
