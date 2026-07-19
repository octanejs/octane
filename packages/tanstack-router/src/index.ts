// @octanejs/tanstack-router — TanStack Router for the octane renderer.
//
// TanStack Router splits a framework-agnostic core (`@tanstack/router-core`: the
// Router/route-tree/matching/history/reactive-store) from a thin React binding
// (`@tanstack/react-router`). Mirroring @octanejs/tanstack-query, this package re-exports
// the core VERBATIM and reimplements only the React binding on octane's hooks. The
// load-bearing seam is router-core's reactive store: `createRouter` supplies the
// CLIENT store factory (`createAtom`/`batch` from `@tanstack/store`), whose atoms
// expose `.subscribe`/`.get` — bound to octane's `useSyncExternalStore` by
// `useStore`. The match tree renders pull-based: `RouterProvider` → first match →
// each route's `<Outlet/>` looks up the NEXT match via `matchContext`.
//
// Scope: code-based routing at react-router parity — RouterProvider (+
// RouterContextProvider/Wrap/InnerWrap), the full Match pipeline (Suspense /
// CatchBoundary / CatchNotFound per route, pending/error/redirect statuses,
// remountDeps, shellComponent), the router event lifecycle
// (onLoad/onBeforeRouteMount/onResolved/onRendered + resolvedLocation — scroll
// restoration restores off it), Link with preloading/masking/active-options,
// createLink/useLinkProps, navigation blocking (useBlocker/Block), the full
// read-hook set (useMatch and friends, nearest-match resolution via
// matchContext), Route/getRouteApi hook accessors, Await/useAwaited, lazy
// routes, and search validation/middleware from core. Deferred: file-based
// routing + codegen (`createFileRoute`, @tanstack/router-plugin), SSR entries
// (RouterServer/RouterClient, HeadContent/Scripts), and devtools.
export * from '@tanstack/router-core';
export {
	createHistory,
	createBrowserHistory,
	createHashHistory,
	createMemoryHistory,
} from './history';
// History types on the main entry (upstream parity). `NavigateOptions` is NOT
// re-exported from history — router-core's richer NavigateOptions wins.
export type {
	RouterHistory,
	HistoryLocation,
	ParsedPath,
	HistoryState,
	ParsedHistoryState,
	HistoryAction,
	BlockerFnArgs,
	BlockerFn,
	NavigationBlocker,
} from '@tanstack/history';

export { createRouter, Router } from './router';
export {
	createRoute,
	createRootRoute,
	createRootRouteWithContext,
	createRouteMask,
	getRouteApi,
	Route,
	RootRoute,
	RouteApi,
} from './route';
// Framework-facing component types (react-router parity, on octane renderables).
// route.ts also narrows router-core's *Extensions interfaces to these via module
// augmentation — mirroring upstream's route.tsx/router.tsx `declare module`.
export type {
	SyncRouteComponent,
	AsyncRouteComponent,
	RouteComponent,
	ErrorRouteComponent,
	NotFoundRouteComponent,
} from './route';
export { routerContext, getRouterContext, matchContext, useRouter } from './context';
export { useStore } from './useStore';
export { useRouterState } from './useRouterState';
export {
	useMatch,
	useLocation,
	useParams,
	useSearch,
	useLoaderData,
	useLoaderDeps,
	useRouteContext,
	useMatches,
	useParentMatches,
	useChildMatches,
	useNavigate,
	useCanGoBack,
} from './hooks';
export { useAwaited } from './useAwaited';
export { useLinkProps, createLink, linkOptions } from './link';
export { useBlocker, Block } from './useBlocker.tsrx';
export type { UseBlockerOpts, ShouldBlockFn } from './useBlocker.tsrx';
export { useMatchRoute, MatchRoute } from './MatchRoute.tsrx';
export { useElementScrollRestoration } from './useElementScrollRestoration';
export { lazyRouteComponent } from './lazyRouteComponent';

export { RouterProvider, RouterContextProvider } from './RouterProvider.tsrx';
export type { RouterProps } from './RouterProvider.tsrx';
export { Outlet } from './Outlet.tsrx';
export { Link } from './Link.tsrx';
export { Navigate } from './Navigate.tsrx';
export { Await } from './Await.tsrx';
export { ScrollRestoration } from './ScrollRestoration.tsrx';
export { Matches } from './Matches.tsrx';
export { Match } from './Match.tsrx';
export { CatchBoundary, ErrorComponent } from './CatchBoundary.tsrx';
export { CatchNotFound, DefaultGlobalNotFound } from './not-found.tsrx';
export { ClientOnly, useHydrated } from './ClientOnly.tsrx';
