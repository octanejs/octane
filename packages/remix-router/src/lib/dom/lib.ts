// DOM-mode entry points + hooks — transcribed from react-router@7.18.1
// lib/dom/lib.tsx onto octane: createBrowserRouter / createHashRouter (with
// upstream's __staticRouterHydrationData parsing + error deserialization),
// useSearchParams, and useViewTransitionState (needed internally by NavLink;
// its public export lands in Phase E with the rest of the view-transition
// surface).
import {
	createElement,
	useCallback,
	useContext,
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';
import {
	DataRouterContext,
	DataRouterStateContext,
	FetchersContext,
	NavigationContext,
	RouteContext,
	ViewTransitionContext,
} from '../context';
import type { Location, To } from '../router/history';
import {
	createBrowserHistory,
	createHashHistory,
	createPath,
	invariant,
	warning,
} from '../router/history';
import type { HydrationState, Router as DataRouter } from '../router/router';
import { IDLE_FETCHER, createRouter } from '../router/router';
import type { RelativeRoutingType } from '../router/router';
import type { RouteObject } from '../router/utils';
import {
	ErrorResponseImpl,
	SUPPORTED_ERROR_TYPES,
	joinPaths,
	matchPath,
	stripBasename,
} from '../router/utils';
import { hydrationRouteProperties, mapRouteProperties } from '../components/utils';
import {
	useBlocker,
	useLocation,
	useMatches,
	useNavigate,
	useNavigation,
	useResolvedPath,
	useRouteId,
} from '../hooks';
import type { BlockerFunction } from '../router/router';
import type { URLSearchParamsInit } from './dom';
import { createSearchParams, getFormSubmissionInfo, getSearchParamsForLocation } from './dom';
import { Form } from './Form.tsrx';
import { splitSlot, subSlot } from '../../internal';

export interface DOMRouterOpts {
	basename?: string;
	getContext?: any;
	future?: any;
	hydrationData?: HydrationState;
	dataStrategy?: any;
	patchRoutesOnNavigation?: any;
	instrumentations?: any;
	window?: Window;
}

/**
 * Create a new data router that manages the application path via
 * `history.pushState` / `history.replaceState`.
 */
export function createBrowserRouter(routes: RouteObject[], opts?: DOMRouterOpts): DataRouter {
	return createRouter({
		basename: opts?.basename,
		getContext: opts?.getContext,
		future: opts?.future,
		history: createBrowserHistory({ window: opts?.window }),
		hydrationData: opts?.hydrationData || parseHydrationData(),
		routes,
		mapRouteProperties,
		hydrationRouteProperties,
		dataStrategy: opts?.dataStrategy,
		patchRoutesOnNavigation: opts?.patchRoutesOnNavigation,
		window: opts?.window,
		instrumentations: opts?.instrumentations,
	}).initialize();
}

/**
 * Create a new data router that manages the application path via the URL
 * hash.
 */
export function createHashRouter(routes: RouteObject[], opts?: DOMRouterOpts): DataRouter {
	return createRouter({
		basename: opts?.basename,
		getContext: opts?.getContext,
		future: opts?.future,
		history: createHashHistory({ window: opts?.window }),
		hydrationData: opts?.hydrationData || parseHydrationData(),
		routes,
		mapRouteProperties,
		hydrationRouteProperties,
		dataStrategy: opts?.dataStrategy,
		patchRoutesOnNavigation: opts?.patchRoutesOnNavigation,
		window: opts?.window,
		instrumentations: opts?.instrumentations,
	}).initialize();
}

declare global {
	interface Window {
		__staticRouterHydrationData?: HydrationState;
	}
}

function parseHydrationData(): HydrationState | undefined {
	let state = typeof window !== 'undefined' ? window.__staticRouterHydrationData : undefined;
	if (state && state.errors) {
		state = {
			...state,
			errors: deserializeErrors(state.errors),
		};
	}
	return state;
}

function deserializeErrors(errors: DataRouter['state']['errors']): DataRouter['state']['errors'] {
	if (!errors) return null;
	let entries = Object.entries(errors);
	let serialized: DataRouter['state']['errors'] = {};
	for (let [key, val] of entries) {
		// Hey you!  If you change this, please change the corresponding logic in
		// serializeErrors in react-router-dom/server.tsx :)
		if (val && val.__type === 'RouteErrorResponse') {
			serialized[key] = new ErrorResponseImpl(
				val.status,
				val.statusText,
				val.data,
				val.internal === true,
			);
		} else if (val && val.__type === 'Error') {
			// Attempt to reconstruct the right type of Error (i.e., ReferenceError)
			if (typeof val.__subType === 'string' && SUPPORTED_ERROR_TYPES.includes(val.__subType)) {
				let ErrorConstructor = (window as any)[val.__subType];
				if (typeof ErrorConstructor === 'function') {
					try {
						let error = new ErrorConstructor(val.message);
						// Wipe away the client-side stack trace.  Nothing to fill it in with
						// because we don't serialize SSR stack traces for security reasons
						error.stack = '';
						serialized[key] = error;
					} catch (e) {
						// no-op - fall through and create a normal Error
					}
				}
			}

			if (serialized[key] == null) {
				let error = new Error(val.message);
				// Wipe away the client-side stack trace.  Nothing to fill it in with
				// because we don't serialize SSR stack traces for security reasons
				error.stack = '';
				serialized[key] = error;
			}
		} else {
			serialized[key] = val;
		}
	}
	return serialized;
}

export type SetURLSearchParams = (
	nextInit?: URLSearchParamsInit | ((prev: URLSearchParams) => URLSearchParamsInit),
	navigateOpts?: any,
) => void;

/**
 * Returns a tuple of the current URL's `URLSearchParams` and a function to
 * update them. Setting the search params causes a navigation.
 */
export function useSearchParams(...args: any[]): [URLSearchParams, SetURLSearchParams] {
	const [user, slot] = splitSlot(args);
	const defaultInit = user[0] as URLSearchParamsInit | undefined;

	warning(
		typeof URLSearchParams !== 'undefined',
		`You cannot use the \`useSearchParams\` hook in a browser that does not ` +
			`support the URLSearchParams API. If you need to support Internet ` +
			`Explorer 11, we recommend you load a polyfill such as ` +
			`https://github.com/ungap/url-search-params.`,
	);

	let defaultSearchParamsRef = useRef(
		null as URLSearchParams | null,
		subSlot(slot, 'usp:default') as any,
	);
	if (defaultSearchParamsRef.current === null) {
		defaultSearchParamsRef.current = createSearchParams(defaultInit);
	}
	let hasSetSearchParamsRef = useRef(false, subSlot(slot, 'usp:hasSet') as any);

	let location = useLocation();
	let searchParams = useMemo(
		() =>
			// Only merge in the defaults if we haven't yet called setSearchParams.
			// Once we call that we want those to take precedence, otherwise you can't
			// remove a param with setSearchParams({}) if it has an initial value
			getSearchParamsForLocation(
				location.search,
				hasSetSearchParamsRef.current ? null : defaultSearchParamsRef.current,
			),
		[location.search],
		subSlot(slot, 'usp:memo') as any,
	);

	let navigate = useNavigate(subSlot(slot, 'usp:nav')) as (to: To, opts?: any) => void;
	let setSearchParams = useCallback(
		((nextInit, navigateOptions) => {
			const newSearchParams = createSearchParams(
				typeof nextInit === 'function' ? nextInit(new URLSearchParams(searchParams)) : nextInit,
			);
			hasSetSearchParamsRef.current = true;
			navigate('?' + newSearchParams, navigateOptions);
		}) as SetURLSearchParams,
		[navigate, searchParams],
		subSlot(slot, 'usp:cb') as any,
	);

	return [searchParams, setSearchParams];
}

/**
 * Returns `true` when there is an active view transition to the given
 * location. NOTE: the public export lands in Phase E; NavLink consumes this
 * internally for its `isTransitioning` render prop (always `false` while
 * RouterProvider's view-transition paths are dormant).
 */
export function useViewTransitionState(to: To, ...args: any[]): boolean {
	const [user, slot] = splitSlot(args);
	const { relative } = (user[0] ?? {}) as { relative?: RelativeRoutingType };
	let vtContext = useContext(ViewTransitionContext);

	invariant(
		vtContext != null,
		"`useViewTransitionState` must be used within `react-router-dom`'s `RouterProvider`.  " +
			'Did you accidentally import `RouterProvider` from `react-router`?',
	);

	let ctx = useContext(DataRouterContext);
	invariant(ctx, 'useViewTransitionState must be used within a data router.');
	let { basename } = ctx;
	let path = useResolvedPath(to, { relative }, subSlot(slot, 'uvts:path')) as {
		pathname: string;
	};
	if (!vtContext.isTransitioning) {
		return false;
	}

	let currentPath =
		stripBasename(vtContext.currentLocation.pathname, basename) ||
		vtContext.currentLocation.pathname;
	let nextPath =
		stripBasename(vtContext.nextLocation.pathname, basename) || vtContext.nextLocation.pathname;

	// Transition is active if we're going to or coming from the indicated
	// destination.  This ensures that other PUSH navigations that reverse
	// an indicated transition apply.
	return (
		matchPath(path.pathname, nextPath) != null || matchPath(path.pathname, currentPath) != null
	);
}

// ── Phase D — mutations ─────────────────────────────────────────────────────
// useSubmit / useFormAction / useFetcher / useFetchers — transcribed from
// react-router@7.18.1 lib/dom/lib.tsx. The dom-side data-router guards mirror
// upstream's local DataRouterHook enum + console errors.

enum DataRouterHook {
	UseScrollRestoration = 'useScrollRestoration',
	UseSubmit = 'useSubmit',
	UseFetcher = 'useFetcher',
}

enum DataRouterStateHook {
	UseFetcher = 'useFetcher',
	UseFetchers = 'useFetchers',
	UseScrollRestoration = 'useScrollRestoration',
}

function getDataRouterConsoleError(hookName: DataRouterHook | DataRouterStateHook) {
	return `${hookName} must be used within a data router.  See https://reactrouter.com/en/main/routers/picking-a-router.`;
}

function useDataRouterContext(hookName: DataRouterHook) {
	let ctx = useContext(DataRouterContext);
	invariant(ctx, getDataRouterConsoleError(hookName));
	return ctx;
}

function useDataRouterState(hookName: DataRouterStateHook) {
	let state = useContext(DataRouterStateContext);
	invariant(state, getDataRouterConsoleError(hookName));
	return state;
}

let fetcherId = 0;
const getUniqueFetcherId = () => `__${String(++fetcherId)}__`;

export type SubmitFunction = (target: any, options?: any) => Promise<void>;
export type FetcherSubmitFunction = (target: any, options?: any) => Promise<void>;

/**
 * The imperative version of `<Form>` — submits a form (element, `FormData`,
 * plain object, or JSON body) to a route action or loader.
 */
export function useSubmit(...args: any[]): SubmitFunction {
	const [, slot] = splitSlot(args);
	let { router } = useDataRouterContext(DataRouterHook.UseSubmit);
	let { basename } = useContext(NavigationContext);
	let currentRouteId = useRouteId();

	let routerFetch = router.fetch;
	let routerNavigate = router.navigate;

	return useCallback(
		(async (target: any, options: any = {}) => {
			let { action, method, encType, formData, body } = getFormSubmissionInfo(target, basename);

			if (options.navigate === false) {
				let key = options.fetcherKey || getUniqueFetcherId();
				await routerFetch(key, currentRouteId!, options.action || action, {
					defaultShouldRevalidate: options.defaultShouldRevalidate,
					preventScrollReset: options.preventScrollReset,
					formData,
					body,
					formMethod: options.method || method,
					formEncType: options.encType || encType,
					flushSync: options.flushSync,
				});
			} else {
				await routerNavigate(options.action || action, {
					defaultShouldRevalidate: options.defaultShouldRevalidate,
					preventScrollReset: options.preventScrollReset,
					formData,
					body,
					formMethod: options.method || method,
					formEncType: options.encType || encType,
					replace: options.replace,
					state: options.state,
					fromRouteId: currentRouteId,
					flushSync: options.flushSync,
					viewTransition: options.viewTransition,
				});
			}
		}) as SubmitFunction,
		[routerFetch, routerNavigate, basename, currentRouteId],
		subSlot(slot, 'us:cb') as any,
	);
}

/**
 * Resolves the URL to the closest route in the component hierarchy instead of
 * the current URL of the app. Used internally by `<Form>` to resolve the
 * `action` to the closest route.
 */
export function useFormAction(...args: any[]): string {
	const [user, slot] = splitSlot(args);
	const action = user[0] as string | undefined;
	const { relative } = (user[1] ?? {}) as { relative?: RelativeRoutingType };

	let { basename } = useContext(NavigationContext);
	let routeContext = useContext(RouteContext);
	invariant(routeContext, 'useFormAction must be used inside a RouteContext');

	let [match] = routeContext.matches.slice(-1);
	// Shallow clone path so we can modify it below, otherwise we modify the
	// object referenced by useMemo inside useResolvedPath
	let path = {
		...(useResolvedPath(action ? action : '.', { relative }, subSlot(slot, 'ufa:path')) as any),
	};

	// If no action was specified, browsers will persist current search params
	// when determining the path, so match that behavior
	// https://github.com/remix-run/remix/issues/927
	let location = useLocation();
	if (action == null) {
		// Safe to write to this directly here since if action was undefined, we
		// would have called useResolvedPath(".") which will never include a search
		path.search = location.search;

		// When grabbing search params from the URL, remove any included ?index param
		// since it might not apply to our contextual route.  We add it back based
		// on match.route.index below
		let params = new URLSearchParams(path.search);
		let indexValues = params.getAll('index');
		let hasNakedIndexParam = indexValues.some((v) => v === '');
		if (hasNakedIndexParam) {
			params.delete('index');
			indexValues.filter((v) => v).forEach((v) => params.append('index', v));
			let qs = params.toString();
			path.search = qs ? `?${qs}` : '';
		}
	}

	if ((!action || action === '.') && match.route.index) {
		path.search = path.search ? path.search.replace(/^\?/, '?index&') : '?index';
	}

	// If we're operating within a basename, prepend it to the pathname prior
	// to creating the form action.  If this is a root navigation, then just use
	// the raw basename which allows the basename to have full control over the
	// presence of a trailing slash on root actions
	if (basename !== '/') {
		path.pathname = path.pathname === '/' ? basename : joinPaths([basename, path.pathname]);
	}

	return createPath(path);
}

export type FetcherWithComponents<TData = any> = any;

/**
 * A hook for interacting with route loaders/actions WITHOUT navigating —
 * returns a fetcher with `Form`/`submit`/`load`/`reset` plus the live fetcher
 * state/data.
 */
export function useFetcher(...args: any[]): FetcherWithComponents {
	const [user, slot] = splitSlot(args);
	const { key } = (user[0] ?? {}) as { key?: string };

	let { router } = useDataRouterContext(DataRouterHook.UseFetcher);
	let state = useDataRouterState(DataRouterStateHook.UseFetcher);
	let fetcherData = useContext(FetchersContext);
	let route = useContext(RouteContext);
	let routeId = route.matches[route.matches.length - 1]?.route.id;

	invariant(fetcherData, `useFetcher must be used inside a FetchersContext`);
	invariant(route, `useFetcher must be used inside a RouteContext`);
	invariant(routeId != null, `useFetcher can only be used on routes that contain a unique "id"`);

	// Fetcher key handling
	let defaultKey = useId(subSlot(slot, 'uf:id') as any);
	let [fetcherKey, setFetcherKey] = useState(key || defaultKey, subSlot(slot, 'uf:key') as any);
	if (key && key !== fetcherKey) {
		setFetcherKey(key);
	}

	let { deleteFetcher, getFetcher, resetFetcher, fetch: routerFetch } = router;

	// Registration/cleanup
	useEffect(
		() => {
			getFetcher(fetcherKey);
			return () => deleteFetcher(fetcherKey);
		},
		[deleteFetcher, getFetcher, fetcherKey],
		subSlot(slot, 'uf:reg') as any,
	);

	// Fetcher additions
	let load = useCallback(
		async (href: string, opts?: { flushSync?: boolean }) => {
			invariant(routeId, 'No routeId available for fetcher.load()');
			await routerFetch(fetcherKey, routeId, href, opts as any);
		},
		[fetcherKey, routeId, routerFetch],
		subSlot(slot, 'uf:load') as any,
	);

	let submitImpl = useSubmit(subSlot(slot, 'uf:submitImpl'));
	let submit = useCallback(
		(async (target: any, opts: any) => {
			await submitImpl(target, {
				...opts,
				navigate: false,
				fetcherKey,
			});
		}) as FetcherSubmitFunction,
		[fetcherKey, submitImpl],
		subSlot(slot, 'uf:submit') as any,
	);

	let reset = useCallback(
		(opts?: { reason?: unknown }) => resetFetcher(fetcherKey, opts),
		[resetFetcher, fetcherKey],
		subSlot(slot, 'uf:reset') as any,
	);

	// Bound `<fetcher.Form>` — a plain octane component closing over the key
	// (upstream memoizes a forwardRef; octane refs are props and flow through
	// the spread).
	let FetcherForm = useMemo(
		() => {
			return function FetcherForm(props: any) {
				return createElement(Form as any, { ...props, navigate: false, fetcherKey });
			};
		},
		[fetcherKey],
		subSlot(slot, 'uf:form') as any,
	);

	// Exposed FetcherWithComponents
	let fetcher = state.fetchers.get(fetcherKey) || IDLE_FETCHER;
	let data = fetcherData.get(fetcherKey);
	let fetcherWithComponents = useMemo(
		() => ({
			Form: FetcherForm,
			submit,
			load,
			reset,
			...fetcher,
			data,
		}),
		[FetcherForm, submit, load, reset, fetcher, data],
		subSlot(slot, 'uf:combined') as any,
	);

	return fetcherWithComponents;
}

/**
 * Returns an array of all in-flight fetchers (each with its unique `key`) —
 * useful for optimistic UI over submissions made elsewhere in the app.
 */
export function useFetchers(...args: any[]): any[] {
	const [, slot] = splitSlot(args);
	let state = useDataRouterState(DataRouterStateHook.UseFetchers);
	return useMemo(
		() =>
			Array.from(state.fetchers.entries()).map(([key, fetcher]) => ({
				...fetcher,
				key,
			})),
		[state.fetchers],
		subSlot(slot, 'ufs:memo') as any,
	);
}

// ── Phase E — guards / scroll ───────────────────────────────────────────────

export type GetScrollRestorationKeyFunction = (location: Location, matches: any[]) => string | null;

const SCROLL_RESTORATION_STORAGE_KEY = 'react-router-scroll-positions';
let savedScrollPositions: Record<string, number> = {};

function getScrollRestorationKey(
	location: Location,
	matches: any[],
	basename: string,
	getKey?: GetScrollRestorationKeyFunction,
) {
	let key: string | null = null;
	if (getKey) {
		if (basename !== '/') {
			key = getKey(
				{
					...location,
					pathname: stripBasename(location.pathname, basename) || location.pathname,
				},
				matches,
			);
		} else {
			key = getKey(location, matches);
		}
	}
	if (key == null) {
		key = location.key;
	}
	return key;
}

/**
 * When rendered inside a RouterProvider, will restore scroll positions on
 * navigations.
 */
export function useScrollRestoration(...args: any[]): void {
	const [user, slot] = splitSlot(args);
	const { getKey, storageKey } = (user[0] ?? {}) as {
		getKey?: GetScrollRestorationKeyFunction;
		storageKey?: string;
	};
	let { router } = useDataRouterContext(DataRouterHook.UseScrollRestoration);
	let { restoreScrollPosition, preventScrollReset } = useDataRouterState(
		DataRouterStateHook.UseScrollRestoration,
	);
	let { basename } = useContext(NavigationContext);
	let location = useLocation();
	let matches = useMatches();
	let navigation = useNavigation();

	// Trigger manual scroll restoration while we're active
	useEffect(
		() => {
			window.history.scrollRestoration = 'manual';
			return () => {
				window.history.scrollRestoration = 'auto';
			};
		},
		[],
		subSlot(slot, 'usr:manual') as any,
	);

	// Save positions on pagehide
	usePageHide(
		useCallback(
			() => {
				if (navigation.state === 'idle') {
					let key = getScrollRestorationKey(location, matches, basename, getKey);
					savedScrollPositions[key] = window.scrollY;
				}
				try {
					sessionStorage.setItem(
						storageKey || SCROLL_RESTORATION_STORAGE_KEY,
						JSON.stringify(savedScrollPositions),
					);
				} catch (error) {
					warning(
						false,
						`Failed to save scroll positions in sessionStorage, <ScrollRestoration /> will not work properly (${error}).`,
					);
				}
				window.history.scrollRestoration = 'auto';
			},
			[navigation.state, getKey, basename, location, matches, storageKey],
			subSlot(slot, 'usr:saveCb') as any,
		),
		undefined,
		subSlot(slot, 'usr:pagehide'),
	);

	// Read in any saved scroll locations
	if (typeof document !== 'undefined') {
		useLayoutEffect(
			() => {
				try {
					let sessionPositions = sessionStorage.getItem(
						storageKey || SCROLL_RESTORATION_STORAGE_KEY,
					);
					if (sessionPositions) {
						savedScrollPositions = JSON.parse(sessionPositions);
					}
				} catch (e) {
					// no-op, use default empty object
				}
			},
			[storageKey],
			subSlot(slot, 'usr:read') as any,
		);

		// Enable scroll restoration in the router
		useLayoutEffect(
			() => {
				let disableScrollRestoration = router?.enableScrollRestoration(
					savedScrollPositions,
					() => window.scrollY,
					getKey
						? (location, matches) => getScrollRestorationKey(location, matches, basename, getKey)
						: undefined,
				);
				return () => disableScrollRestoration && disableScrollRestoration();
			},
			[router, basename, getKey],
			subSlot(slot, 'usr:enable') as any,
		);

		// Restore scrolling when state.restoreScrollPosition changes
		useLayoutEffect(
			() => {
				// Explicit false means don't do anything (used for submissions or revalidations)
				if (restoreScrollPosition === false) {
					return;
				}

				// been here before, scroll to it
				if (typeof restoreScrollPosition === 'number') {
					window.scrollTo(0, restoreScrollPosition);
					return;
				}

				// try to scroll to the hash
				try {
					if (location.hash) {
						let el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
						if (el) {
							el.scrollIntoView();
							return;
						}
					}
				} catch {
					warning(
						false,
						`"${location.hash.slice(1)}" is not a decodable element ID. The view will not scroll to it.`,
					);
				}

				// Don't reset if this navigation opted out
				if (preventScrollReset === true) {
					return;
				}

				// otherwise go to the top on new locations
				window.scrollTo(0, 0);
			},
			[location, restoreScrollPosition, preventScrollReset],
			subSlot(slot, 'usr:restore') as any,
		);
	}
}

/**
 * Emulates the browser's scroll restoration on location changes. In data mode
 * (this port's scope) upstream renders nothing — the SSR inline-script branch
 * needs a FrameworkContext (framework mode, out of scope), so the component
 * is the hook + `null`.
 */
export function ScrollRestoration(props: {
	getKey?: GetScrollRestorationKeyFunction;
	storageKey?: string;
}): null {
	// Plain-.ts component: hand-passed stable slot (state is keyed per
	// component-instance scope).
	useScrollRestoration(
		{ getKey: props.getKey, storageKey: props.storageKey },
		Symbol.for('rr:scroll-restoration') as any,
	);
	return null;
}

/**
 * Set up a callback to be fired on Window's `beforeunload` event.
 */
export function useBeforeUnload(callback: (event: BeforeUnloadEvent) => any, ...args: any[]): void {
	const [user, slot] = splitSlot(args);
	const { capture } = (user[0] ?? {}) as { capture?: boolean };
	useEffect(
		() => {
			let opts = capture != null ? { capture } : undefined;
			window.addEventListener('beforeunload', callback, opts);
			return () => {
				window.removeEventListener('beforeunload', callback, opts);
			};
		},
		[callback, capture],
		subSlot(slot, 'ubu:eff') as any,
	);
}

/*
 * Setup a callback to be fired on the window's `pagehide` event. This is
 * useful for saving some data to `window.localStorage` just before the page
 * refreshes.  This event is better supported than beforeunload across browsers.
 *
 * Note: The `callback` argument should be a function created with
 * `useCallback()`.
 */
function usePageHide(
	callback: (event: PageTransitionEvent) => any,
	options?: { capture?: boolean },
	slot?: symbol,
): void {
	let { capture } = options || {};
	useEffect(
		() => {
			let opts = capture != null ? { capture } : undefined;
			window.addEventListener('pagehide', callback, opts);
			return () => {
				window.removeEventListener('pagehide', callback, opts);
			};
		},
		[callback, capture],
		subSlot(slot, 'uph:eff') as any,
	);
}

/**
 * Wrapper around useBlocker to show a `window.confirm` prompt to users
 * instead of building a custom UI with useBlocker. Exported as
 * `unstable_usePrompt`, as upstream (the flag will not be removed — the
 * technique has rough edges across browsers).
 */
export function usePrompt(
	{ when, message }: { when: boolean | BlockerFunction; message: string },
	...args: any[]
): void {
	const [, slot] = splitSlot(args);
	let blocker = useBlocker(when, subSlot(slot, 'up:blocker'));

	useEffect(
		() => {
			if (blocker.state === 'blocked') {
				let proceed = window.confirm(message);
				if (proceed) {
					// This timeout is needed to avoid a weird "race" on POP navigations
					// between the `window.history` revert navigation and the result of
					// `window.confirm`
					setTimeout(blocker.proceed, 0);
				} else {
					blocker.reset();
				}
			}
		},
		[blocker, message],
		subSlot(slot, 'up:confirm') as any,
	);

	useEffect(
		() => {
			if (blocker.state === 'blocked' && !when) {
				blocker.reset();
			}
		},
		[blocker, when],
		subSlot(slot, 'up:reset') as any,
	);
}

// Keep Location imported for the docs types above.
export type { Location };
