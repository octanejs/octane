// Transcribed from react-router@7.18.1 lib/components.tsx (the non-component
// utilities) onto octane: mapRouteProperties / hydrationRouteProperties /
// createMemoryRouter / Deferred / getOptimisticRouterState, plus warnOnce
// (upstream imports it from lib/server-runtime/warnings.ts — inlined here,
// the server runtime is out of scope).
import { createElement } from 'octane';
import type { InitialEntry } from '../router/history';
import { createMemoryHistory } from '../router/history';
import { warning } from '../router/history';
import type { Router as DataRouter, RouterState } from '../router/router';
import { createRouter } from '../router/router';
import type { RouteMatch, RouteObject } from '../router/utils';
import { ENABLE_DEV_WARNINGS } from '../context';
import { _renderMatches } from '../hooks';

/**
 * Renders the result of `matchRoutes()` into a React element.
 */
export function renderMatches(matches: RouteMatch[] | null): unknown | null {
	return _renderMatches(matches);
}

const alreadyWarned: { [message: string]: boolean } = {};

export function warnOnce(condition: boolean, message: string): void {
	if (!condition && !alreadyWarned[message]) {
		alreadyWarned[message] = true;
		console.warn(message);
	}
}

export function mapRouteProperties(route: RouteObject) {
	let updates: Partial<RouteObject> & { hasErrorBoundary: boolean } = {
		// Note: this check also occurs in createRoutesFromChildren so update
		// there if you change this -- please and thank you!
		hasErrorBoundary:
			route.hasErrorBoundary || route.ErrorBoundary != null || route.errorElement != null,
	};

	if (route.Component) {
		if (ENABLE_DEV_WARNINGS) {
			if (route.element) {
				warning(
					false,
					'You should not include both `Component` and `element` on your route - ' +
						'`Component` will be used.',
				);
			}
		}
		Object.assign(updates, {
			element: createElement(route.Component as any),
			Component: undefined,
		});
	}

	if (route.HydrateFallback) {
		if (ENABLE_DEV_WARNINGS) {
			if (route.hydrateFallbackElement) {
				warning(
					false,
					'You should not include both `HydrateFallback` and `hydrateFallbackElement` on your route - ' +
						'`HydrateFallback` will be used.',
				);
			}
		}
		Object.assign(updates, {
			hydrateFallbackElement: createElement(route.HydrateFallback as any),
			HydrateFallback: undefined,
		});
	}

	if (route.ErrorBoundary) {
		if (ENABLE_DEV_WARNINGS) {
			if (route.errorElement) {
				warning(
					false,
					'You should not include both `ErrorBoundary` and `errorElement` on your route - ' +
						'`ErrorBoundary` will be used.',
				);
			}
		}
		Object.assign(updates, {
			errorElement: createElement(route.ErrorBoundary as any),
			ErrorBoundary: undefined,
		});
	}

	return updates;
}

export const hydrationRouteProperties: (keyof RouteObject)[] = [
	'HydrateFallback',
	'hydrateFallbackElement',
];

export interface MemoryRouterOpts {
	basename?: string;
	getContext?: any;
	future?: any;
	hydrationData?: any;
	initialEntries?: InitialEntry[];
	initialIndex?: number;
	dataStrategy?: any;
	patchRoutesOnNavigation?: any;
	instrumentations?: any;
}

export function createMemoryRouter(routes: RouteObject[], opts?: MemoryRouterOpts): DataRouter {
	return createRouter({
		basename: opts?.basename,
		getContext: opts?.getContext,
		future: opts?.future,
		history: createMemoryHistory({
			initialEntries: opts?.initialEntries,
			initialIndex: opts?.initialIndex,
		}),
		hydrationData: opts?.hydrationData,
		routes,
		hydrationRouteProperties,
		mapRouteProperties,
		dataStrategy: opts?.dataStrategy,
		patchRoutesOnNavigation: opts?.patchRoutesOnNavigation,
		instrumentations: opts?.instrumentations,
	}).initialize();
}

export class Deferred<T> {
	status: 'pending' | 'resolved' | 'rejected' = 'pending';
	promise: Promise<T>;
	// @ts-expect-error - no initializer
	resolve: (value: T) => void;
	// @ts-expect-error - no initializer
	reject: (reason?: unknown) => void;
	constructor() {
		this.promise = new Promise((resolve, reject) => {
			this.resolve = (value) => {
				if (this.status === 'pending') {
					this.status = 'resolved';
					resolve(value);
				}
			};
			this.reject = (reason) => {
				if (this.status === 'pending') {
					this.status = 'rejected';
					reject(reason);
				}
			};
		});
	}
}

export function getOptimisticRouterState(
	currentState: RouterState,
	newState: RouterState,
): RouterState {
	return {
		// Don't surface "current location specific" stuff mid-navigation
		// (historyAction, location, matches, loaderData, errors, initialized,
		// restoreScroll, preventScrollReset, blockers, etc.)
		...currentState,
		// Only surface "pending/in-flight stuff"
		// (navigation, revalidation, actionData, fetchers, )
		navigation:
			newState.navigation.state !== 'idle' ? newState.navigation : currentState.navigation,
		revalidation:
			newState.revalidation !== 'idle' ? newState.revalidation : currentState.revalidation,
		actionData:
			newState.navigation.state !== 'submitting' ? newState.actionData : currentState.actionData,
		fetchers: newState.fetchers,
	};
}
