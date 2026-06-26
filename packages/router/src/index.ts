// @octanejs/router — TanStack Router for the octane renderer.
//
// TanStack Router splits a framework-agnostic core (`@tanstack/router-core`: the
// Router/route-tree/matching/history/reactive-store) from a thin React binding
// (`@tanstack/react-router`). Mirroring @octanejs/query, this package re-exports
// the core VERBATIM and reimplements only the React binding on octane's hooks. The
// load-bearing seam is router-core's reactive store: `createRouter` supplies the
// CLIENT store factory (`createAtom`/`batch` from `@tanstack/store`), whose atoms
// expose `.subscribe`/`.get` — bound to octane's `useSyncExternalStore` by
// `useStore`. The match tree renders pull-based: `RouterProvider` → first match →
// each route's `<Outlet/>` looks up the NEXT match via `matchContext`.
//
// v1 scope: code-based routing (createRouter/createRootRoute/createRoute),
// RouterProvider, Outlet, Link, Navigate, and the read hooks (useRouter,
// useRouterState, useLocation, useParams, useSearch, useMatches, useLoaderData,
// useNavigate). Deferred: file-based routing + codegen, devtools, search-param
// validation/middleware, useBlocker, ScrollRestoration, Await/streaming, lazy routes.
export * from '@tanstack/router-core';
export {
	createHistory,
	createBrowserHistory,
	createHashHistory,
	createMemoryHistory,
} from './history';

export { createRouter, Router } from './router';
export {
	createRoute,
	createRootRoute,
	createRootRouteWithContext,
	Route,
	RootRoute,
} from './route';
export { routerContext, getRouterContext, matchContext, useRouter } from './context';
export { useStore } from './useStore';
export { useRouterState } from './useRouterState';
export { useLocation, useParams, useSearch, useLoaderData, useMatches, useNavigate } from './hooks';
export { useAwaited } from './useAwaited';
export { lazyRouteComponent } from './lazyRouteComponent';

export { RouterProvider } from './RouterProvider.tsrx';
export { Outlet } from './Outlet.tsrx';
export { Link } from './Link.tsrx';
export { Navigate } from './Navigate.tsrx';
export { Await } from './Await.tsrx';
export { ScrollRestoration } from './ScrollRestoration.tsrx';
