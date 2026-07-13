// Transcribed from react-router@8.2.0 lib/components.tsx (the non-component
// utilities) onto octane: hydrationRouteProperties /
// createMemoryRouter / Deferred / getOptimisticRouterState, plus warnOnce
// (upstream imports it from lib/server-runtime/warnings.ts — inlined here,
// the server runtime is out of scope).
import type { InitialEntry } from '../router/history';
import { createMemoryHistory } from '../router/history';
import type { Router as DataRouter, RouterState } from '../router/router';
import { createRouter } from '../router/router';
import type { RouteMatch, RouteObject } from '../router/utils';
import { defaultMapRouteProperties } from '../router/utils';
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
		mapRouteProperties: defaultMapRouteProperties,
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
