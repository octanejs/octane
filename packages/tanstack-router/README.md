# @octanejs/tanstack-router

[TanStack Router](https://tanstack.com/router) for the [octane](https://github.com/octanejs/octane) UI framework.

## Installation

```sh
npm install @octanejs/tanstack-router
pnpm add @octanejs/tanstack-router
```

TanStack Router splits a framework-agnostic core (`@tanstack/router-core` — the
router, route tree, matching, history, and the reactive store) from a thin React
binding (`@tanstack/react-router`). Mirroring `@octanejs/tanstack-query`, this package
re-exports the core **verbatim** and reimplements the framework binding on octane's
hooks. The main runtime surface follows `@tanstack/react-router`, so most router
code works by changing the import.

```tsx
import {
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
  Outlet,
  Link,
  useParams,
} from '@octanejs/tanstack-router';
import { createRoot } from 'octane';

const rootRoute = createRootRoute({ component: RootLayout });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Home });
const itemRoute = createRoute({ getParentRoute: () => rootRoute, path: 'item/$id', component: Item });

const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute, itemRoute]) });

createRoot(document.getElementById('app')!).render(() => <RouterProvider router={router} />);

function RootLayout() @{
  <div>
    <Link to="/">{'Home'}</Link>
    <Outlet />
  </div>
}

function Item() @{
  const { id } = useParams({ strict: false });
  <h1>{('Item ' + id) as string}</h1>
}
```

The same code works in React-style `.tsx` too (`className`, `return <jsx>`, `<Link>Home</Link>`) — see `tests/_fixtures/basic-react.tsx`.

## How it works

`@tanstack/router-core` keeps the router state in a reactive store. On the client,
`createRouter` supplies the store factory (`createAtom`/`batch` from
`@tanstack/store` — framework-agnostic), whose atoms expose `.subscribe`/`.get`.
`useStore` binds those to octane's `useSyncExternalStore`, and every read hook
(`useRouterState`, `useLocation`, `useParams`, …) is a selector over it. The match
tree renders **pull-based**: `RouterProvider` renders the first match, and each route
component's `<Outlet/>` looks up the next match via `matchContext` — so navigation
re-renders only the matches that changed.

## Headless routing

Use `@octanejs/tanstack-router/core` when an application owns its render tree and
only needs matching, loading, and navigation. It exposes Octane's router adapter,
the framework-neutral `@tanstack/router-core` APIs, and history constructors
without importing route components or hooks.

Browser and hash histories created by this package preserve existing application
fields in History API state objects and Navigation API entry state during initialization.

## Same-route search navigation

Same-route search navigations now render store updates urgently. If the route
component suspends on the new search input, its pending fallback can replace the
current content; the previous automatic same-route hold no longer applies. To
retain stale content while the new data loads, use `useDeferredValue` from `octane`
on the search input (for example, `page`) and render the suspending content from
that deferred value. The router location still advances when navigation commits.

## Scope

Included: `createRouter`, `createRootRoute`, `createRoute`, `RouterProvider`,
`Outlet`, `Link`, `Navigate`, `useRouter`, `useRouterState`, `useLocation`,
`useParams`, `useSearch`, `useLoaderData`, `useMatches`, `useNavigate`,
**`ScrollRestoration`**, **`Await`/`useAwaited` + `defer` (streaming deferred data)**,
and **`lazyRouteComponent` (lazy/code-split route components)**, and **not-found
rendering** (`notFoundComponent`/`defaultNotFoundComponent`/`notFoundMode` — an
unknown URL or a loader throwing `notFound()` renders the not-found UI inside the
layout, per TanStack's fuzzy/root boundary rules), plus the full
`@tanstack/router-core` re-export (`redirect`, `notFound`, history, search helpers,
types). The typed route factories, route-bound hooks, and `Link` surface preserve
TanStack Router's registered-route inference.

The 2026-07-06 gap-closure sweep (see `docs/tanstack-parity-audit.md`) additionally
landed the full Match pipeline (per-route Suspense/CatchBoundary/CatchNotFound,
pending/error/redirected/notFound statuses), router lifecycle events, `useBlocker`/
`Block`, the complete read-hook family (`useMatch`, `useRouteContext`,
`useLoaderDeps`, `useParentMatches`/`useChildMatches`, …), `getRouteApi`/
`createRouteMask`, `useMatchRoute`/`MatchRoute`, `ClientOnly`, search-param
validation/middleware, and full `Link` parity (preloading, masking,
`activeProps`/`inactiveProps`) — differential-verified byte-equal against the real
`@tanstack/react-router`.

File routing is supported through `createFileRoute` and `createLazyFileRoute`.
`@octanejs/tanstack-start` consumes the exported
`@octanejs/tanstack-router/generator-plugin` from its package-owned generator; the
integration masks native `.tsrx` template bodies without changing source offsets,
so generated route-tree edits preserve authored Octane route modules.

The `@octanejs/tanstack-router/ssr/server` and `/ssr/client` entries provide
`RouterServer`, `RouterClient`, buffered rendering, and readable-stream rendering.
Route-owned `Html`/`Head`/`Body`, `HeadContent`, `Scripts`, and `ScriptOnce` preserve
full-document SSR, head assets, and hydration. Streaming uses Octane's native
injection source, so the document begins with a doctype, renderer styles are placed
inside `<head>` with the configured CSP nonce, and serialized router data can stream
without a byte-level HTML transform. These entries are the router foundation used
by `@octanejs/tanstack-start`.

```tsx
// streaming a deferred loader value
<Await promise={data.slow} fallback={'loading…'}>
  {(value) => <pre>{JSON.stringify(value) as string}</pre>}
</Await>

// scroll restoration: either the component or createRouter({ scrollRestoration: true })
<ScrollRestoration />

// code-split a route's component
createRoute({ path: 'item/$id', component: lazyRouteComponent(() => import('./Item')) })
```

Current scope, divergences, and verification status are tracked in the generated
[bindings status table](../../docs/bindings-status.md) (sourced from this
package's `status.json`).

## Divergences from `@tanstack/react-router`

- **Refs are props** (octane's model) — `createLink`'s `forwardRef` becomes a `ref`
  prop.
- **Native DOM events** — link callbacks receive browser events rather than React
  synthetic events.
- Router devtools are distributed separately and are not part of this binding.

## Compiled route trees

Use `@octanejs/tanstack-router/compiled` for a tree whose selected route, shell,
pending, error and not-found components are compiled Octane `@{ ... }` bodies.
The entry exports `RouterProvider`, `Outlet`, and `lazyRouteComponent`; the
existing `CompiledRouterProvider`, `CompiledOutlet`, and
`lazyCompiledRouteComponent` names remain aliases. TanStack owns matching,
loading, navigation, history and render acknowledgements.

`PreconfiguredRouterProvider` accepts only `{ router }` and owns the provider,
match projection, and failure presentation in Strong mode. The compiled error
boundary owns synchronous route error reporting and not-found propagation.
Configure the router before rendering it. Use `RouterProvider` when provider
option props need to reconfigure the router synchronously.

```tsx
import {
  createRootRoute, createRoute, createRouter, createBrowserHistory,
  RouterProvider, Outlet, lazyRouteComponent,
} from '@octanejs/tanstack-router/compiled';

const root = createRootRoute({ component: Layout });
const item = createRoute({
  getParentRoute: () => root,
  path: 'items/$id',
  component: lazyRouteComponent(() => import('./Item')),
});
const router = createRouter({
  routeTree: root.addChildren([item]),
  history: createBrowserHistory(),
});

function Layout() @{
  <main><Outlet /></main>
}
function App() @{
  <RouterProvider router={router} />
}
```

Import read/navigation hooks (`useMatch`, `useParams`, `useSearch`,
`useLoaderData`, `useLoaderDeps`, `useRouteContext`, `useLocation`,
`useMatches`, `useParentMatches`, `useChildMatches`, `useNavigate`,
`useCanGoBack`, `useRouter`, and `useRouterState`) from the same `/compiled`
entry. It owns separate non-callable contexts. Its `createRoute`,
`createRootRoute`, `createRootRouteWithContext`, `getRouteApi`, `createFileRoute`,
`createLazyRoute`, and `createLazyFileRoute` attach accessors to those contexts.
Route-bound hooks and `Route.Link` work alongside the exported `Link`,
`useLinkProps`, and `createLink`. Factories construct router-core base instances;
they do not promise `instanceof Route` from the ordinary entry.

The compiled entry also exports `Html`, `Head`, `Body`, `HeadContent`, `Scripts`,
`Asset`, `useTags`, `getAssetKeys`, `ClientOnly`, and `useHydrated` for document
shells. Root shells can read their root match and context. SSR and client builds
must select the same entry for a tree. Start applications select this entry with
`compiled: true` in their Start plugin options, including generated route and
split-module imports.

Compiled selection removes descriptor creation from route selection, bound
links and document shells, but does not make the entire binding Strong or
remove the generic renderer. Link retains synchronous `flushSync` so its
transition cue is already visible in `onBeforeNavigate` callbacks. Both entries
share a Strong keyed script template. Newly mounted route scripts execute once;
hydration adopts existing scripts without replaying them, and self-removing
transport scripts leave no item markers behind. Managed keys, nonces and route
ownership are retained. Scroll-restoration scripts use a server-owned static
hydration range, which is removed after hydration and omitted on client-only
mounts. Error propagation and lifecycle dependencies retain their existing
contracts.

`Wrap` and `InnerWrap` remain unsupported and produce an explicit diagnostic.
For returned JSX, host strings, renderable wrappers or mixed route trees, retain
the ordinary entry. Its public APIs and contexts remain available unchanged.
