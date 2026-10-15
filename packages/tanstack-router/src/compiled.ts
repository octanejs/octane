// Opt-in source-owned renderer for route trees with compiled bodies.
import './frameworkTypes';
export * from '@tanstack/router-core';
export { Router, createRouter } from './router';
export {
	createHistory,
	createBrowserHistory,
	createHashHistory,
	createMemoryHistory,
} from './history';
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
export {
	useRouter,
	useRouterState,
	useMatch,
	useParams,
	useSearch,
	useLoaderData,
	useLoaderDeps,
	useRouteContext,
	useLocation,
	useMatches,
	useParentMatches,
	useChildMatches,
	useNavigate,
	useCanGoBack,
} from './compiled/bindings';
export type { UseRouterStateOptions, UseRouterStateResult } from './routerStateBinding';
export {
	CompiledRouterProvider,
	CompiledRouterProvider as RouterProvider,
	CompiledOutlet,
	CompiledOutlet as Outlet,
	lazyCompiledRouteComponent,
	lazyCompiledRouteComponent as lazyRouteComponent,
} from './compiled/Matches.tsrx';
export {
	createRoute,
	createRootRoute,
	createRootRouteWithContext,
	rootRouteWithContext,
	getRouteApi,
	createFileRoute,
	createLazyRoute,
	createLazyFileRoute,
} from './compiled/route.tsrx';
export { Link, useLinkProps, createLink } from './compiled/Link.tsrx';
export { ClientOnly, useHydrated } from './ClientOnly.tsrx';
export { getAssetKeys } from './assetKeys';
export { Html, Head, Body, Asset, HeadContent, Scripts, useTags } from './compiled/Document.tsrx';
export type { AssetKeys } from './assetKeys';
export type {
	LinkComponent,
	LinkComponentProps,
	LinkProps,
	UseLinkPropsOptions,
} from './linkTypes';
