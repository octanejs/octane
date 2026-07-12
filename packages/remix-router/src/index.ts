// @octanejs/remix-router — react-router for the octane renderer.
//
// react-router v7 ships as a single package whose framework-agnostic core has
// no runtime subpath, so the core (lib/router/* + framework-free lib helpers)
// is VENDORED byte-close (see scripts/vendor-remix-router.mjs) and only the
// React layer is transcribed onto octane's hooks. This entry mirrors upstream
// packages/react-router/index.ts for everything the port has shipped so far —
// the phased roadmap lives in docs/remix-router-port-plan.md, and
// tests/conformance/parity.test.ts pins exactly which upstream exports are
// still expected-missing per phase.
//
// Octane-specific: hooks are keyed by a compiler-injected per-call-site
// Symbol appended as the LAST argument of every `use*` call; the hooks in
// lib/hooks.ts forward that slot into their composed base hooks. Refs are
// props (no forwardRef).

// ── Vendored core (verbatim re-exports, upstream index.ts order) ───────────
export { createContext, RouterContextProvider } from './lib/router/utils';
export { Action as NavigationType, createPath, parsePath } from './lib/router/history';
export type {
	ServerInstrumentation,
	ClientInstrumentation,
	InstrumentRequestHandlerFunction,
	InstrumentRouterFunction,
	InstrumentRouteFunction,
	InstrumentationHandlerResult,
} from './lib/router/instrumentation';
export { IDLE_NAVIGATION, IDLE_FETCHER, IDLE_BLOCKER } from './lib/router/router';
export {
	data,
	generatePath,
	isRouteErrorResponse,
	matchPath,
	matchRoutes,
	redirect,
	redirectDocument,
	replace,
	resolvePath,
} from './lib/router/utils';
export type { InitialEntry, Location, Path, To } from './lib/router/history';
export type {
	HydrationState,
	GetScrollPositionFunction,
	GetScrollRestorationKeyFunction,
	StaticHandlerContext,
	Fetcher,
	Navigation,
	NavigationStates,
	RelativeRoutingType,
	Blocker,
	BlockerFunction,
	Router as DataRouter,
	RouterState,
	RouterInit,
	RouterSubscriber,
	RouterNavigateOptions,
	RouterFetchOptions,
	RevalidationState,
} from './lib/router/router';
export type {
	ActionFunction,
	ActionFunctionArgs,
	DataRouteMatch,
	DataRouteObject,
	DataStrategyFunction,
	DataStrategyFunctionArgs,
	DataStrategyMatch,
	DataStrategyResult,
	ErrorResponse,
	FormEncType,
	FormMethod,
	IndexRouteObject,
	LazyRouteFunction,
	LoaderFunction,
	LoaderFunctionArgs,
	MiddlewareFunction,
	NonIndexRouteObject,
	ParamParseKey,
	Params,
	PathMatch,
	PathParam,
	PathPattern,
	RedirectFunction,
	RouteMatch,
	RouteObject,
	ShouldRevalidateFunction,
	ShouldRevalidateFunctionArgs,
	UIMatch,
} from './lib/router/utils';
export { href } from './lib/href';
export { createSearchParams } from './lib/dom/dom';
export type {
	FetcherSubmitOptions,
	ParamKeyValuePair,
	SubmitOptions,
	URLSearchParamsInit,
	SubmitTarget,
} from './lib/dom/dom';

// ── React layer (Phases A + B) ─────────────────────────────────────────────
export type { NavigateOptions, Navigator, ClientOnErrorFunction } from './lib/context';
export { AwaitContextProvider as UNSAFE_AwaitContextProvider } from './lib/context';
export { Await } from './lib/Await.tsrx';
export { Router } from './lib/components/Router.tsrx';
export { RouterProvider, Outlet } from './lib/components/RouterProvider.tsrx';
export { createMemoryRouter, renderMatches } from './lib/components/utils';
export type { MemoryRouterOpts } from './lib/components/utils';
export { MemoryRouter } from './lib/components/MemoryRouter.tsrx';
export { Navigate } from './lib/components/Navigate';
export type { NavigateProps } from './lib/components/Navigate';
export { Routes } from './lib/components/Routes.tsrx';
export {
	Route,
	createRoutesFromChildren,
	createRoutesFromElements,
} from './lib/components/routes-collector';
export type { NavigateFunction } from './lib/hooks';
export {
	useActionData,
	useAsyncError,
	useAsyncValue,
	useHref,
	useInRouterContext,
	useLoaderData,
	useLocation,
	useMatch,
	useMatches,
	useNavigate,
	useNavigation,
	useNavigationType,
	useOutlet,
	useOutletContext,
	useParams,
	useResolvedPath,
	useRevalidator,
	useRouteError,
	useRouteLoaderData,
	useRoutes,
} from './lib/hooks';

// ── DOM layer (Phases A + C + D; guards/scroll/VT land in E) ───────────────
export { Link } from './lib/dom/Link.tsrx';
export { useLinkClickHandler } from './lib/dom/hooks';
export { NavLink } from './lib/dom/NavLink.tsrx';
export type { NavLinkRenderProps } from './lib/dom/NavLink.tsrx';
export {
	BrowserRouter,
	HashRouter,
	HistoryRouter as unstable_HistoryRouter,
} from './lib/dom/routers.tsrx';
export {
	createBrowserRouter,
	createHashRouter,
	useSearchParams,
	useSubmit,
	useFormAction,
	useFetcher,
	useFetchers,
} from './lib/dom/lib';
export type {
	DOMRouterOpts,
	SetURLSearchParams,
	SubmitFunction,
	FetcherSubmitFunction,
	FetcherWithComponents,
} from './lib/dom/lib';
export { Form } from './lib/dom/Form.tsrx';

// ── UNSAFE_ surface (shipped subset) ────────────────────────────────────────
export {
	createMemoryHistory as UNSAFE_createMemoryHistory,
	createBrowserHistory as UNSAFE_createBrowserHistory,
	createHashHistory as UNSAFE_createHashHistory,
	invariant as UNSAFE_invariant,
} from './lib/router/history';
export { createRouter as UNSAFE_createRouter } from './lib/router/router';
export { ErrorResponseImpl as UNSAFE_ErrorResponseImpl } from './lib/router/utils';
export {
	DataRouterContext as UNSAFE_DataRouterContext,
	DataRouterStateContext as UNSAFE_DataRouterStateContext,
	FetchersContext as UNSAFE_FetchersContext,
	LocationContext as UNSAFE_LocationContext,
	NavigationContext as UNSAFE_NavigationContext,
	RouteContext as UNSAFE_RouteContext,
	ViewTransitionContext as UNSAFE_ViewTransitionContext,
} from './lib/context';
export {
	hydrationRouteProperties as UNSAFE_hydrationRouteProperties,
	mapRouteProperties as UNSAFE_mapRouteProperties,
} from './lib/components/utils';
export {
	WithComponentProps as UNSAFE_WithComponentProps,
	withComponentProps as UNSAFE_withComponentProps,
	WithHydrateFallbackProps as UNSAFE_WithHydrateFallbackProps,
	withHydrateFallbackProps as UNSAFE_withHydrateFallbackProps,
	WithErrorBoundaryProps as UNSAFE_WithErrorBoundaryProps,
	withErrorBoundaryProps as UNSAFE_withErrorBoundaryProps,
} from './lib/components/with-props';
export type { Register } from './lib/types/register';
export type { MiddlewareEnabled as UNSAFE_MiddlewareEnabled } from './lib/types/future';
