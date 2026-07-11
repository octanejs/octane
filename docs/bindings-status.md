# @octanejs/\* bindings status (generated)

<!-- GENERATED FILE — do not edit. Edit packages/<name>/status.json and
     regenerate with `pnpm bindings:status`. -->

The central status table for the 15 `@octanejs/*` framework bindings.
Each row is sourced from that package's `packages/<name>/status.json` — the
machine-readable status block maintained next to the code it describes — merged
with the version in its `package.json`. CI runs `pnpm bindings:status:check`,
so a scope change that isn't reflected here fails the build.

The bindings deliberately sit at different maturity levels: some are
behaviorally complete ports verified differentially against the real React
library, others are thin bindings over a framework-agnostic core, and some are
explicitly partial or alpha. "Verified" is the date of the last parity
verification (audit, differential run, or full-suite pass) against the pinned
upstream version.

| Package | Ports | Supported surface | Known divergences | SSR / hydration | Verified |
| --- | --- | --- | --- | --- | --- |
| [`@octanejs/base-ui`](#octanejsbase-ui) | `@base-ui/react@1.6.0` | Alpha, in progress: the foundation + overlay infrastructure and the first component set (Dialog, AlertDialog, Popover open-path) landed, ported at full fidelity and differential-verified against the real `@base-ui/react`. | Handlers receive native DOM events (no synthetic layer); `forwardRef` becomes ref-as-prop; `className` composes via octane's `normalizeClass` (the render-prop string merge matches Base UI exactly) | No dedicated SSR/hydration tests yet. | 2026-07-08 |
| [`@octanejs/floating-ui`](#octanejsfloating-ui) | `@floating-ui/react@0.27.19` | Positioning (`useFloating`, ref-aware `arrow`, the `@floating-ui/dom` middleware re-exports, the floating tree), the full interaction-hook set (`useInteractions`, `useHover` + `safePolygon`, `useClick`, `useFocus`, `useDismiss`, `useRole`, `useClientPoint`, `useListNavigation`, `useTypeahead`), the component layer (`FloatingPortal`, `FloatingOverlay`, `FloatingFocusManager`, `FloatingArrow`, `FloatingList`, `Composite`), and transitions + `FloatingDelayGroup`. | `forwardRef` becomes octane's ref-as-prop | No dedicated SSR/hydration tests. | 2026-07-05 |
| [`@octanejs/hook-form`](#octanejshook-form) | `react-hook-form@7.81.0` | Complete port of react-hook-form 7.81.0 (upstream commit b7df98c2) with the upstream test suite ported: `useForm`, `useController`, `useFieldArray`, `useFormState`, `useWatch`, `useFormContext`/`FormProvider`, schema resolvers, and all validation modes. | `register()` returns `onInput` (octane's native per-keystroke event) instead of React's synthetic `onChange`; mode names and `register` option keys keep the upstream spelling; Eight ported tests are pinned `it.fails` on octane-wide design differences (microtask-flush commit granularity, eager `Object.is` setState bailout, native input-event delivery React swallows) | Supported and tested — the upstream `*.server.test.tsx` suite runs via `octane/server` with byte-identical markup. | 2026-07-09 |
| [`@octanejs/jotai`](#octanejsjotai) | `jotai@2.20.1` | Complete 1:1 port: the framework-agnostic vanilla core (`jotai/vanilla`, `/vanilla/utils`, `/vanilla/internals`) is reused verbatim; the React layer (`Provider`, `useStore`, `useAtom`, `useAtomValue`, `useSetAtom`) and `react/utils` (`useResetAtom`, `useReducerAtom`, `useAtomCallback`, `useHydrateAtoms`) are ported onto octane hooks, preserving upstream's useReducer force-update + effect-subscription implementation, async atoms via octane's `use()`. | `jotai/babel/*` (React-specific compile-time plugins) is not shipped | No SSR-specific surface; `useHydrateAtoms` is ported and usable for hydration seeding; no dedicated SSR tests. | 2026-07-11 |
| [`@octanejs/lexical`](#octanejslexical) | `@lexical/react@0.46.0` | 35 of 39 `@lexical/react` modules ported: composer + contexts, the editable surface, plain/rich text, and the full plugin/menu set (history, lists + check-list, links, tables, markdown shortcuts, the typeahead/node-menu/context-menu family, draggable-block, character-limit, …) plus the `useLexical*` hooks. | Positioning uses `@floating-ui/dom` instead of `@floating-ui/react`; The class-based `LexicalErrorBoundary` becomes an octane error boundary; `forwardRef` becomes ref-as-prop | No dedicated SSR/hydration tests. | 2026-07-09 |
| [`@octanejs/mdx`](#octanejsmdx) | `@mdx-js/mdx@3.1.1` | The full compile-don't-interpret pipeline: `.mdx`/`.md` → `@mdx-js/mdx` (reused verbatim) → octane compiler, via the `octaneMdx()` Vite plugin plus the `./compile` and `./server` entries; `@mdx-js/react`'s provider layer (`MDXProvider`/`useMDXComponents`) is ported onto octane context. The octane website runs on it. | `useMDXComponents` drops upstream's `useMemo` referential-stability wrapper so the call is valid in both server and client runtimes (same observable mapping) | Full SSR + hydration coverage — server-compiled documents render via `renderToString` and hydrate byte-for-byte (`ssr.test.ts`, `hydration.test.ts`). | 2026-07-07 |
| [`@octanejs/motion`](#octanejsmotion) | `motion@12.40.0` | Core surface: `motion.<tag>` (animate, gestures, variants with propagation/stagger, drag, layout basics), `AnimatePresence`, `MotionConfig`, and the motion-value hooks (`useMotionValue`, `useScroll`, `useTransform`, `useSpring`, `useAnimate`, `useMotionValueEvent`); motion-dom's animation engine and gesture primitives are reused verbatim. | Exit animations run via cleanup-before-detach instead of React's deferred-deletion machinery; `layout`/`layoutId` use single-element FLIP, not the full projection tree | No SSR-specific surface; no dedicated SSR tests. | 2026-07-06 |
| [`@octanejs/radix`](#octanejsradix) | `radix-ui@1.6.1` | Complete against the unified `radix-ui@1.6.1` component surface — all primitives (incl. Dialog, the Menu/DropdownMenu/ContextMenu family, Popover, Tooltip, Select, NavigationMenu, Toast, Menubar, Slider, the form controls, and OneTimePasswordField/PasswordToggleField) plus the composition/state/overlay foundations — verified by a differential suite (same fixtures through octane and the real radix-ui, byte-identical DOM). | `Slot`/`asChild` compose element descriptors (prop-position JSX, `createElement`, `.map()` returns), not children-position JSX; `forwardRef` becomes octane's ref-as-prop | SSR/hydration coverage for the overlay/portal components is still open (tracked in the migration plan). | 2026-07-08 |
| [`@octanejs/recharts`](#octanejsrecharts) | `recharts@3.9.2` | Partial (phases 0–1 of 5): the static `BarChart`/`LineChart` pipeline end-to-end (`isAnimationActive={false}`), byte-identical to upstream in the differential rig; the Redux/RTK state layer, `Surface`/`Layer`, and the pure shape set are in place. | Chart events coordinate through octane's native delegated events rather than React's synthetic layer | Untested; text measurement (`getStringSize`) returns 0×0 under SSR. | 2026-07-07 |
| [`@octanejs/redux`](#octanejsredux) | `react-redux@9.3.0` | The hooks + `Provider` surface of react-redux 9.3.0 (`useSelector`, `useDispatch`, `useStore`, and the custom-context factory variants) on octane's `useSyncExternalStore`; works with any Redux 5 / Redux Toolkit store. Export parity is pinned by test. | `connect()` (the legacy HOC surface) intentionally throws — the hooks API is the supported surface; Error messages are octane-branded | No SSR-specific surface; no dedicated SSR tests. | 2026-07-08 |
| [`@octanejs/stylex`](#octanejsstylex) | `@stylexjs/stylex@0.19.0` | Full compile-time integration: re-exports the StyleX runtime API (`create`, `props`, `attrs`, `keyframes`, `defineVars`, `createTheme`) and registers as an import source; the `/vite` plugin runs the StyleX compiler over octane's compiled output and emits one static atomic stylesheet (`virtual:stylex.css`) with zero StyleX runtime in the bundle. | The `sx` JSX prop is not supported — spread `{...stylex.props(...)}` instead; The compiler runs over octane's compiled output rather than source, so StyleX's own PostCSS source-scanning setup is unused | Works under SSR — the stylesheet is static and server markup carries the final class names; no dedicated SSR test files. | 2026-07-09 |
| [`@octanejs/tanstack-query`](#octanejstanstack-query) | `@tanstack/react-query@5.101.0` | Complete: 58/58 runtime exports plus the full TypeScript surface; the export surface is byte-identical to upstream in both directions (locked by test), and `@tanstack/query-core` is re-exported verbatim. | Suspense integrates via octane's `use(thenable)` rather than throwing a promise (observable behavior matches) | `HydrationBoundary` fully ported (incl. streaming `promise`/`dehydratedAt` re-hydration); the SSR/streaming server entries and server-render tests are still open. | 2026-07-06 |
| [`@octanejs/tanstack-router`](#octanejstanstack-router) | `@tanstack/react-router@1.170.16` | Code-based routing at full binding parity (2026-07-06 gap-closure sweep): the full Match pipeline, router lifecycle events, the complete read-hook family, full-parity `Link` (preloading, masking, `activeProps`), `useBlocker`/`Block`, `Await`/`defer`, scroll restoration, lazy routes, not-found handling, and search-param validation/middleware — differential-verified byte-equal vs the real `@tanstack/react-router`. | Refs are props — `createLink`'s `forwardRef` becomes a `ref` prop; No `flushSync` in the `Link` click handler; navigation state updates run synchronously | SSR entries (`RouterServer`/`RouterClient`, `HeadContent`/`Scripts`) not yet ported; no SSR tests. | 2026-07-06 |
| [`@octanejs/testing-library`](#octanejstesting-library) | `@testing-library/react` (unpinned) | `render`/`rerender`/`cleanup`/`renderHook` + `act` over the verbatim `@testing-library/dom` (every query, `screen`, `within`, `waitFor`, `fireEvent`, `prettyDOM`, `configure`), with commit timing wired to octane's scheduler via the dom-library's `eventWrapper`/`asyncWrapper` config. | `fireEvent` dispatches real native events — no React remappings (`fireEvent.change` fires a native `change`, not `input`) and no enter/leave/focus double-dispatch; Not ported: the `ReactStrictMode` wrapper, `legacyRoot`, and the `onCaughtError`/`onRecoverableError` options | `hydrate: true` adopts octane SSR output via `hydrateRoot`. | 2026-07-09 |
| [`@octanejs/zustand`](#octanejszustand) | `zustand@5.0.14` | Complete 1:1 port: the framework-agnostic vanilla store is reused verbatim; `create`/`useStore`, `shallow`/`useShallow`, the traditional equality-fn variants, and all middleware (persist, devtools, subscribeWithSelector, combine, redux). | Unstable selectors (a new reference every render) settle after a bounded number of re-renders instead of hitting React's `useSyncExternalStore` warning loop — still prefer `useShallow` | No SSR-specific surface; no dedicated SSR tests. | 2026-07-06 |

## @octanejs/base-ui

[`packages/base-ui`](../packages/base-ui) `0.1.1` — ports `@base-ui/react@1.6.0`. Status data: [`packages/base-ui/status.json`](../packages/base-ui/status.json).

Alpha, in progress: the foundation + overlay infrastructure and the first component set (Dialog, AlertDialog, Popover open-path) landed, ported at full fidelity and differential-verified against the real `@base-ui/react`.

Known divergences:

- Handlers receive native DOM events (no synthetic layer).
- `forwardRef` becomes ref-as-prop; `className` composes via octane's `normalizeClass` (the render-prop string merge matches Base UI exactly).

SSR / hydration: No dedicated SSR/hydration tests yet.

See also: [`docs/base-ui-migration-plan.md`](base-ui-migration-plan.md)

## @octanejs/floating-ui

[`packages/floating-ui`](../packages/floating-ui) `0.1.2` — ports `@floating-ui/react@0.27.19`. Status data: [`packages/floating-ui/status.json`](../packages/floating-ui/status.json).

Positioning (`useFloating`, ref-aware `arrow`, the `@floating-ui/dom` middleware re-exports, the floating tree), the full interaction-hook set (`useInteractions`, `useHover` + `safePolygon`, `useClick`, `useFocus`, `useDismiss`, `useRole`, `useClientPoint`, `useListNavigation`, `useTypeahead`), the component layer (`FloatingPortal`, `FloatingOverlay`, `FloatingFocusManager`, `FloatingArrow`, `FloatingList`, `Composite`), and transitions + `FloatingDelayGroup`.

Known divergences:

- `forwardRef` becomes octane's ref-as-prop.

SSR / hydration: No dedicated SSR/hydration tests.

- Not yet ported: the `inner`/`useInnerOffset` middleware pair.

## @octanejs/hook-form

[`packages/hook-form`](../packages/hook-form) `0.1.0` — ports `react-hook-form@7.81.0`. Status data: [`packages/hook-form/status.json`](../packages/hook-form/status.json).

Complete port of react-hook-form 7.81.0 (upstream commit b7df98c2) with the upstream test suite ported: `useForm`, `useController`, `useFieldArray`, `useFormState`, `useWatch`, `useFormContext`/`FormProvider`, schema resolvers, and all validation modes.

Known divergences:

- `register()` returns `onInput` (octane's native per-keystroke event) instead of React's synthetic `onChange`; mode names and `register` option keys keep the upstream spelling.
- Eight ported tests are pinned `it.fails` on octane-wide design differences (microtask-flush commit granularity, eager `Object.is` setState bailout, native input-event delivery React swallows).

SSR / hydration: Supported and tested — the upstream `*.server.test.tsx` suite runs via `octane/server` with byte-identical markup.

See also: [`docs/octanejs-hook-form-plan.md`](octanejs-hook-form-plan.md)

## @octanejs/jotai

[`packages/jotai`](../packages/jotai) `0.1.0` — ports `jotai@2.20.1`. Status data: [`packages/jotai/status.json`](../packages/jotai/status.json).

Complete 1:1 port: the framework-agnostic vanilla core (`jotai/vanilla`, `/vanilla/utils`, `/vanilla/internals`) is reused verbatim; the React layer (`Provider`, `useStore`, `useAtom`, `useAtomValue`, `useSetAtom`) and `react/utils` (`useResetAtom`, `useReducerAtom`, `useAtomCallback`, `useHydrateAtoms`) are ported onto octane hooks, preserving upstream's useReducer force-update + effect-subscription implementation, async atoms via octane's `use()`.

Known divergences:

- `jotai/babel/*` (React-specific compile-time plugins) is not shipped.

SSR / hydration: No SSR-specific surface; `useHydrateAtoms` is ported and usable for hydration seeding; no dedicated SSR tests.

## @octanejs/lexical

[`packages/lexical`](../packages/lexical) `0.1.2` — ports `@lexical/react@0.46.0`. Status data: [`packages/lexical/status.json`](../packages/lexical/status.json).

35 of 39 `@lexical/react` modules ported: composer + contexts, the editable surface, plain/rich text, and the full plugin/menu set (history, lists + check-list, links, tables, markdown shortcuts, the typeahead/node-menu/context-menu family, draggable-block, character-limit, …) plus the `useLexical*` hooks.

Known divergences:

- Positioning uses `@floating-ui/dom` instead of `@floating-ui/react`.
- The class-based `LexicalErrorBoundary` becomes an octane error boundary; `forwardRef` becomes ref-as-prop.

SSR / hydration: No dedicated SSR/hydration tests.

- Not ported (4 modules, with reasons): `LexicalCollaborationPlugin` (real-time Yjs collaboration needs a two-peer harness), `LexicalExtensionComposer`/`LexicalExtensionEditorComposer` (the newer extension API wraps a React-only subsystem), and `LexicalTreeView` (wraps the `@lexical/devtools-core` React component).

## @octanejs/mdx

[`packages/mdx`](../packages/mdx) `0.1.0` — ports `@mdx-js/mdx@3.1.1`. Status data: [`packages/mdx/status.json`](../packages/mdx/status.json).

The full compile-don't-interpret pipeline: `.mdx`/`.md` → `@mdx-js/mdx` (reused verbatim) → octane compiler, via the `octaneMdx()` Vite plugin plus the `./compile` and `./server` entries; `@mdx-js/react`'s provider layer (`MDXProvider`/`useMDXComponents`) is ported onto octane context. The octane website runs on it.

Known divergences:

- `useMDXComponents` drops upstream's `useMemo` referential-stability wrapper so the call is valid in both server and client runtimes (same observable mapping).

SSR / hydration: Full SSR + hydration coverage — server-compiled documents render via `renderToString` and hydrate byte-for-byte (`ssr.test.ts`, `hydration.test.ts`).

See also: [`docs/mdx-migration-plan.md`](mdx-migration-plan.md)

## @octanejs/motion

[`packages/motion`](../packages/motion) `0.1.2` — ports `motion@12.40.0`. Status data: [`packages/motion/status.json`](../packages/motion/status.json).

Core surface: `motion.<tag>` (animate, gestures, variants with propagation/stagger, drag, layout basics), `AnimatePresence`, `MotionConfig`, and the motion-value hooks (`useMotionValue`, `useScroll`, `useTransform`, `useSpring`, `useAnimate`, `useMotionValueEvent`); motion-dom's animation engine and gesture primitives are reused verbatim.

Known divergences:

- Exit animations run via cleanup-before-detach instead of React's deferred-deletion machinery.
- `layout`/`layoutId` use single-element FLIP, not the full projection tree.

SSR / hydration: No SSR-specific surface; no dedicated SSR tests.

- Not yet ported: nested/shared layout projection (incl. child scale correction and shared layout during drag), drag momentum + elastic physics, reduced-motion enforcement, the `useTransform` output-map form, and `when: 'beforeChildren' | 'afterChildren'` sequencing.

## @octanejs/radix

[`packages/radix`](../packages/radix) `0.1.2` — ports `radix-ui@1.6.1`. Status data: [`packages/radix/status.json`](../packages/radix/status.json).

Complete against the unified `radix-ui@1.6.1` component surface — all primitives (incl. Dialog, the Menu/DropdownMenu/ContextMenu family, Popover, Tooltip, Select, NavigationMenu, Toast, Menubar, Slider, the form controls, and OneTimePasswordField/PasswordToggleField) plus the composition/state/overlay foundations — verified by a differential suite (same fixtures through octane and the real radix-ui, byte-identical DOM).

Known divergences:

- `Slot`/`asChild` compose element descriptors (prop-position JSX, `createElement`, `.map()` returns), not children-position JSX.
- `forwardRef` becomes octane's ref-as-prop.

SSR / hydration: SSR/hydration coverage for the overlay/portal components is still open (tracked in the migration plan).

See also: [`docs/radix-migration-plan.md`](radix-migration-plan.md)

## @octanejs/recharts

[`packages/recharts`](../packages/recharts) `0.1.0` — ports `recharts@3.9.2`. Status data: [`packages/recharts/status.json`](../packages/recharts/status.json).

Partial (phases 0–1 of 5): the static `BarChart`/`LineChart` pipeline end-to-end (`isAnimationActive={false}`), byte-identical to upstream in the differential rig; the Redux/RTK state layer, `Surface`/`Layer`, and the pure shape set are in place.

Known divergences:

- Chart events coordinate through octane's native delegated events rather than React's synthetic layer.

SSR / hydration: Untested; text measurement (`getStringSize`) returns 0×0 under SSR.

- Planned next (phases 2–5): `Tooltip`/`Legend`/`ResponsiveContainer`, the remaining cartesian charts, polar charts, and animation + chart sync. Target surface: 97 runtime + 78 type exports.

See also: [`docs/recharts-port-plan.md`](recharts-port-plan.md)

## @octanejs/redux

[`packages/redux`](../packages/redux) `0.1.0` — ports `react-redux@9.3.0`. Status data: [`packages/redux/status.json`](../packages/redux/status.json).

The hooks + `Provider` surface of react-redux 9.3.0 (`useSelector`, `useDispatch`, `useStore`, and the custom-context factory variants) on octane's `useSyncExternalStore`; works with any Redux 5 / Redux Toolkit store. Export parity is pinned by test.

Known divergences:

- `connect()` (the legacy HOC surface) intentionally throws — the hooks API is the supported surface.
- Error messages are octane-branded.

SSR / hydration: No SSR-specific surface; no dedicated SSR tests.

## @octanejs/stylex

[`packages/stylex`](../packages/stylex) `0.1.2` — ports `@stylexjs/stylex@0.19.0`. Status data: [`packages/stylex/status.json`](../packages/stylex/status.json).

Full compile-time integration: re-exports the StyleX runtime API (`create`, `props`, `attrs`, `keyframes`, `defineVars`, `createTheme`) and registers as an import source; the `/vite` plugin runs the StyleX compiler over octane's compiled output and emits one static atomic stylesheet (`virtual:stylex.css`) with zero StyleX runtime in the bundle.

Known divergences:

- The `sx` JSX prop is not supported — spread `{...stylex.props(...)}` instead.
- The compiler runs over octane's compiled output rather than source, so StyleX's own PostCSS source-scanning setup is unused.

SSR / hydration: Works under SSR — the stylesheet is static and server markup carries the final class names; no dedicated SSR test files.

## @octanejs/tanstack-query

[`packages/tanstack-query`](../packages/tanstack-query) `0.1.2` — ports `@tanstack/react-query@5.101.0`. Status data: [`packages/tanstack-query/status.json`](../packages/tanstack-query/status.json).

Complete: 58/58 runtime exports plus the full TypeScript surface; the export surface is byte-identical to upstream in both directions (locked by test), and `@tanstack/query-core` is re-exported verbatim.

Known divergences:

- Suspense integrates via octane's `use(thenable)` rather than throwing a promise (observable behavior matches).

SSR / hydration: `HydrationBoundary` fully ported (incl. streaming `promise`/`dehydratedAt` re-hydration); the SSR/streaming server entries and server-render tests are still open.

See also: [`docs/tanstack-parity-audit.md`](tanstack-parity-audit.md)

## @octanejs/tanstack-router

[`packages/tanstack-router`](../packages/tanstack-router) `0.1.2` — ports `@tanstack/react-router@1.170.16`. Status data: [`packages/tanstack-router/status.json`](../packages/tanstack-router/status.json).

Code-based routing at full binding parity (2026-07-06 gap-closure sweep): the full Match pipeline, router lifecycle events, the complete read-hook family, full-parity `Link` (preloading, masking, `activeProps`), `useBlocker`/`Block`, `Await`/`defer`, scroll restoration, lazy routes, not-found handling, and search-param validation/middleware — differential-verified byte-equal vs the real `@tanstack/react-router`.

Known divergences:

- Refs are props — `createLink`'s `forwardRef` becomes a `ref` prop.
- No `flushSync` in the `Link` click handler; navigation state updates run synchronously.

SSR / hydration: SSR entries (`RouterServer`/`RouterClient`, `HeadContent`/`Scripts`) not yet ported; no SSR tests.

- Still open: file-based routing + the codegen plugin, devtools, and the typed public surface (factories/hooks are still `any`).

See also: [`docs/tanstack-parity-audit.md`](tanstack-parity-audit.md)

## @octanejs/testing-library

[`packages/testing-library`](../packages/testing-library) `0.1.0` — ports `@testing-library/react` (unpinned). Status data: [`packages/testing-library/status.json`](../packages/testing-library/status.json).

`render`/`rerender`/`cleanup`/`renderHook` + `act` over the verbatim `@testing-library/dom` (every query, `screen`, `within`, `waitFor`, `fireEvent`, `prettyDOM`, `configure`), with commit timing wired to octane's scheduler via the dom-library's `eventWrapper`/`asyncWrapper` config.

Known divergences:

- `fireEvent` dispatches real native events — no React remappings (`fireEvent.change` fires a native `change`, not `input`) and no enter/leave/focus double-dispatch.
- Not ported: the `ReactStrictMode` wrapper, `legacyRoot`, and the `onCaughtError`/`onRecoverableError` options.

SSR / hydration: `hydrate: true` adopts octane SSR output via `hydrateRoot`.

- The reused framework-agnostic core is `@testing-library/dom@^10.4.1`; the ported react-testing-library layer tracks upstream behavior rather than a pinned release.

See also: [`docs/testing-library-migration-plan.md`](testing-library-migration-plan.md)

## @octanejs/zustand

[`packages/zustand`](../packages/zustand) `0.1.2` — ports `zustand@5.0.14`. Status data: [`packages/zustand/status.json`](../packages/zustand/status.json).

Complete 1:1 port: the framework-agnostic vanilla store is reused verbatim; `create`/`useStore`, `shallow`/`useShallow`, the traditional equality-fn variants, and all middleware (persist, devtools, subscribeWithSelector, combine, redux).

Known divergences:

- Unstable selectors (a new reference every render) settle after a bounded number of re-renders instead of hitting React's `useSyncExternalStore` warning loop — still prefer `useShallow`.

SSR / hydration: No SSR-specific surface; no dedicated SSR tests.
