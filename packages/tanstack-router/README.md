# @octanejs/tanstack-router

[TanStack Router](https://tanstack.com/router) for the [octane](https://github.com/octanejs/octane) UI framework.

TanStack Router splits a framework-agnostic core (`@tanstack/router-core` — the
router, route tree, matching, history, and the reactive store) from a thin React
binding (`@tanstack/react-router`). Mirroring `@octanejs/tanstack-query`, this package
re-exports the core **verbatim** and reimplements only the binding on octane's hooks.
The public surface matches `@tanstack/react-router`, so most router code works by
changing the import.

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

## v1 scope

Included: `createRouter`, `createRootRoute`, `createRoute`, `RouterProvider`,
`Outlet`, `Link`, `Navigate`, `useRouter`, `useRouterState`, `useLocation`,
`useParams`, `useSearch`, `useLoaderData`, `useMatches`, `useNavigate`,
**`ScrollRestoration`**, **`Await`/`useAwaited` + `defer` (streaming deferred data)**,
and **`lazyRouteComponent` (lazy/code-split route components)**, and **not-found
rendering** (`notFoundComponent`/`defaultNotFoundComponent`/`notFoundMode` — an
unknown URL or a loader throwing `notFound()` renders the not-found UI inside the
layout, per TanStack's fuzzy/root boundary rules), plus the full
`@tanstack/router-core` re-export (`redirect`, `notFound`, history, search helpers,
types).

The 2026-07-06 gap-closure sweep (see `docs/tanstack-parity-audit.md`) additionally
landed the full Match pipeline (per-route Suspense/CatchBoundary/CatchNotFound,
pending/error/redirected/notFound statuses), router lifecycle events, `useBlocker`/
`Block`, the complete read-hook family (`useMatch`, `useRouteContext`,
`useLoaderDeps`, `useParentMatches`/`useChildMatches`, …), `getRouteApi`/
`createRouteMask`, `useMatchRoute`/`MatchRoute`, `ClientOnly`, search-param
validation/middleware, and full `Link` parity (preloading, masking,
`activeProps`/`inactiveProps`) — differential-verified byte-equal against the real
`@tanstack/react-router`.

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

Deferred: file-based routing + the codegen plugin, devtools, the SSR entries
(`RouterServer`/`RouterClient`, `HeadContent`/`Scripts`), and the typed public
surface (factories/hooks are still `any`).

Current scope, divergences, and verification status are tracked in the generated
[bindings status table](../../docs/bindings-status.md) (sourced from this
package's `status.json`).

## Divergences from `@tanstack/react-router`

- **Refs are props** (octane's model) — `createLink`'s `forwardRef` becomes a `ref`
  prop.
- **No `flushSync`** in the `Link` click handler (the one hard `react-dom`
  coupling) — navigation state updates run synchronously in v1.
