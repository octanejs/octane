// Opt-in source-owned renderer for code routes with compiled bodies only.
import './frameworkTypes';
export * from '@tanstack/router-core';
export { Router, createRouter } from './router';
export {
	createHistory,
	createBrowserHistory,
	createHashHistory,
	createMemoryHistory,
} from './history';
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
	CompiledOutlet,
	lazyCompiledRouteComponent,
} from './compiled/Matches.tsrx';
