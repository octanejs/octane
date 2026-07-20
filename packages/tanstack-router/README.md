# @octanejs/tanstack-router

[TanStack Router](https://tanstack.com/router) for the [octane](https://github.com/octanejs/octane) UI framework.

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
