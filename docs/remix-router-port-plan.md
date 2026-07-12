# Octane Port Plan: react-router → `@octanejs/remix-router`

Target: **react-router 7.18.1** (the v7 line; `react-router-dom@7.18.1` is a
pure re-export shim and doubles as a second parity oracle). v8.2.0 exists — the
upgrade path is "bump the tag in `scripts/vendor-remix-router.mjs`, re-vendor,
re-pin export parity" (v8 mostly deletes deprecated APIs); vendor headers make
the diff mechanical.

## 1. Recommendation

One package (`packages/remix-router`) shipping raw TS, mirroring upstream's
`lib/**` layout under `src/lib/**`. react-router v7's `./internal` subpath is
types-only, so the framework-agnostic core CANNOT be consumed as a dependency —
it is **vendored byte-close** (the hook-form model, ~12k lines) and validated
by upstream's own router unit tests running against the vendored copy
(`tests/vendored-core/` — 161 tests, node environment, zero React). The React
layer (~2k lines so far) is transcribed onto octane per the repo's port
doctrine: upstream structure, comments, and warning strings preserved; React
APIs substituted.

Out of scope permanently: framework mode (`lib/dom/ssr/*` — needs
`@react-router/dev`), RSC (`lib/rsc/*`). Final-phase policy: framework client
APIs (Meta/Links/Scripts/…) become throwing stubs so export parity can reach
empty honestly; the server runtime (cookies/sessions/createRequestHandler —
pure Node code) is re-exported from a vendored tree in its own phase.

## 2. Feasibility — the three hardest translation problems

**(a) Block-children `<Routes>` introspection (Phase B).**
`createRoutesFromChildren` walks React children reading `element.type === Route`.
Octane value-position JSX (argument position, prop position, `{expr}` single
children) lowers to walkable `{type, props, children}` descriptors — so
`createRoutesFromElements(<Route>…</Route>)` and `useRoutes(objects)` port
verbatim. Only the literal `<Routes><Route/></Routes>` BLOCK-children form is
opaque (`markChildrenBlock`). Plan: hybrid — descriptor children verbatim;
block children via a registration collector (recharts `Cell` precedent: Routes
provides a collector context, `Route` registers its RouteObject-shaped props in
a layout effect, Routes finalizes pre-paint). Ordering caveat (registration
order == mount order) only affects `matchRoutes` score TIES — documented, with
a DOM-position upgrade path if real mis-orderings surface.

**(b) Class error boundaries under `@try/@catch` (SHIPPED, Phase A).**
`RenderErrorBoundary`'s derived-state rules are reproduced in
`src/lib/RenderErrorBoundary.tsrx`: data errors render the error branch WITHOUT
@catch; render errors land in @catch with componentDidCatch-parity onError
(once per distinct error, during the catch render so rethrows escape); reset on
location-change / revalidation-idle happens in a layout effect one commit later
(documented divergence, tanstack-router CatchBoundary precedent); a defined
`props.error` takes precedence over a stale caught error.

**(c) RouterProvider's startTransition/flushSync/ViewTransition interleave
(structure SHIPPED, VT paths dormant).** Upstream already re-asserts
`React.startTransition` INSIDE the deferred `startViewTransition` callback —
exactly what octane's transition-at-commit constraint requires (see
packages/tanstack-router/src/router.ts:19-53) — so the port is verbatim.
octane's `flushSync` inside an ambient flush degrades to a plain call drained
at that flush's boundary (consumer-invisible; conformance-pinned). The
`useOptimistic` path rides octane's `useOptimistic`. jsdom has no
`startViewTransition`, so the VT paths activate (and get tested) in Phase E.

One octane idiom the port depends on: **children forwarded between internal
layers must travel in PROP position** (`<Inner children={props.children}/>`) —
a JSX `{props.children}` child re-wraps into a children block at each hop,
destroying render-prop identity (Await's render-prop children found this).

## 3. Phases

### Phase 0 — scaffold + vendor + integrity gate — SHIPPED (PR 1)
Vendor script + 15 files (two documented type-only deviations: the
`react-types` shim and the `server-runtime-types` stub); upstream router unit
tests (memory/navigation/redirects/path-resolution/route-fallback/
interruptions, 161 tests) running against the vendored copy in a node-env
vitest project. *Exit criterion (met):* vendored core typechecks standalone and
passes upstream's own suite untouched.

### Phase A — data-mode core — SHIPPED (PR 1)
`context.ts` (10 contexts), `hooks.ts` (read hooks + useNavigate family +
useRoutesImpl/_renderMatches), RenderErrorBoundary/DefaultErrorComponent/Await,
RouterProvider (+DataRoutes/Outlet), createMemoryRouter, `/dom` RouterProvider,
Link + useLinkClickHandler (pulled forward from Phase C). *Exit criterion
(met):* loaders/actions/redirects/errorElement/Await green in conformance +
byte-identical differential vs real react-router; export parity pins the
phase boundary.

### Phase B — declarative mode — SHIPPED (PR 1)
`createRoutesFromChildren/Elements`, `Routes`/`Route` (hybrid per 2a: descriptor
children walked upstream-style, block children via the registration collector),
`MemoryRouter`, `Navigate`, public `useRoutes` path, `UNSAFE_With*Props`.
*Exit criterion (met):* nested/index/param/splat routes + Link navigation +
`<Navigate>` redirect green in BOTH children forms (conformance + differential
byte-parity vs real react-router); the registration-ordering caveat
(mount-order vs source-order, matchRoutes score ties only) is pinned by a
conformance test and documented in status.json. Two convergence rules the
collector depends on: Route props compare STRUCTURALLY (element descriptors
are re-created every render), and opaque block children compare as always-equal
(their content surfaces through the nested collector). Shipped alongside an
octane compiler fix: identity-unchanged renderables in `{expr}` holes now still
dispatch to childSlot, so context consumers below a stable `{children}`
passthrough refresh when a provider re-renders (the navigation-re-render bug
this phase surfaced).

### Phase C — DOM entry + links
`createBrowserRouter`/`createHashRouter`, `BrowserRouter`/`HashRouter`/
`unstable_HistoryRouter`, `NavLink` (render-prop className/style/children),
`useSearchParams`. *Exit criterion:* NavLink active-state differential
byte-parity; searchParams round-trips; browser/hash history smoke in jsdom.

### Phase D — mutations
`Form`, fetcher forms, `useSubmit`, `useFormAction`, `useFetcher`/`useFetchers`
(FetchersContext + per-fetcher flushSync paths). *Exit criterion:* form-encoded
+ JSON submissions and fetcher lifecycles differential-green; native-event
divergences documented hook-form-style.

### Phase E — async guards + scroll + view transitions
`useBlocker`, `unstable_usePrompt`, `ScrollRestoration` +
`UNSAFE_useScrollRestoration`, `useBeforeUnload`, `useViewTransitionState`,
`unstable_useRoute`/`unstable_useRouterState`, activating RouterProvider's VT
paths against octane's ViewTransition support. *Exit criterion:* blocker
proceed/reset flows; scroll keys restored on memory router; VT context marks
observable.

### Phase F — static SSR + full parity
`StaticRouter`/`StaticRouterProvider`/`createStaticHandler`/
`createStaticRouter` on `octane/server`; framework client stubs; server-runtime
re-export; `EXPECTED_MISSING` reaches `[]`. *Exit criterion:* renderToString of
a static data app matches upstream bytes; every upstream root export is
ported / stubbed / omitted-with-reason.

## 4. First milestone — met in PR 1

A memory-router data app with loaders, a redirect, an explicit errorElement
(including recovery on back-navigation), `<Await>` over a deferred value, a
deterministic pending-navigation state, and Link-click navigation — conformance
green and byte-identical against real react-router in the differential rig.

## 5. Risks & open questions

- **Block-children Routes ordering** (2a) — worst case documented divergence;
  DOM-position collector as the upgrade path.
- **Vendor drift** on the 7.7k-line router.ts — mitigated by the re-vendor
  script + headers + the vendored-core gate; hand-edits are prohibited.
- **Fetcher revalidation storms** (Phase D) exercise octane's flushSync
  convergence drain — targeted tests before advertising `flushSync` options.
- **useOptimistic parity** — RouterProvider's `useTransitions === true` path is
  untested until Phase B/C fixtures drive it explicitly.
- **KNOWN_BINDINGS repoint**: `react-router`/`react-router-dom` now map to
  `@octanejs/remix-router` (previously suggested `@octanejs/tanstack-router` as
  the alternative) — the tanstack-router binding remains for TanStack Router
  apps.

**Key source references:** `packages/remix-router/scripts` (vendor),
`packages/tanstack-router/src/CatchBoundary.tsrx` (boundary model),
`packages/recharts/src/component/Cell.ts` (registration pattern),
`packages/octane/src/compiler/compile.js` `soleRenderPropChild` (render-prop
children), `packages/octane/tests/differential/_rig.ts` (byte oracle).
