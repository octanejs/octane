// DOM-mode entry points + hooks — transcribed from react-router@7.18.1
// lib/dom/lib.tsx onto octane: createBrowserRouter / createHashRouter (with
// upstream's __staticRouterHydrationData parsing + error deserialization),
// useSearchParams, and useViewTransitionState (needed internally by NavLink;
// its public export lands in Phase E with the rest of the view-transition
// surface).
import { useCallback, useContext, useMemo, useRef } from 'octane';
import { DataRouterContext, ViewTransitionContext } from '../context';
import type { Location, To } from '../router/history';
import { createBrowserHistory, createHashHistory, invariant, warning } from '../router/history';
import type { HydrationState, Router as DataRouter } from '../router/router';
import { createRouter } from '../router/router';
import type { RelativeRoutingType } from '../router/router';
import type { RouteObject } from '../router/utils';
import {
	ErrorResponseImpl,
	SUPPORTED_ERROR_TYPES,
	matchPath,
	stripBasename,
} from '../router/utils';
import { hydrationRouteProperties, mapRouteProperties } from '../components/utils';
import { useLocation, useNavigate, useResolvedPath } from '../hooks';
import type { URLSearchParamsInit } from './dom';
import { createSearchParams, getSearchParamsForLocation } from './dom';
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

// Keep Location imported for the docs types above.
export type { Location };
