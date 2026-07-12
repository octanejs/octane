// Transcribed from react-router@7.18.1 lib/context.ts onto octane. The ten
// contexts and their shapes are verbatim; octane substitutions: createContext/
// createElement from 'octane', `__DEV__` → NODE_ENV, no displayName (octane
// contexts carry none). RSCRouterContext is kept (hardwired default false — no
// RSC in octane) so `useIsRSCRouterContext` call sites stay verbatim.
import { createContext, createElement, useContext } from 'octane';
import type { History, Location, Action as NavigationType, To } from './router/history';
import type { RelativeRoutingType, Router, StaticHandlerContext } from './router/router';
import type { TrackedPromise, RouteMatch } from './router/utils';

// Upstream: `ClientOnErrorFunction` from ./components (framework-mode error
// reporting hook) — declared locally to keep the vendored-adjacent type
// surface without importing the framework layer.
export type ClientOnErrorFunction = (error: unknown, errorInfo?: unknown) => void;

export interface DataRouterContextObject
	// Omit `future` since those can be pulled from the `router`
	// `NavigationContext` needs `future`/`useTransitions` since it doesn't
	// have a `router` in all cases
	extends Omit<NavigationContextObject, 'future' | 'useTransitions'> {
	router: Router;
	staticContext?: StaticHandlerContext;
	onError?: ClientOnErrorFunction;
}

export const DataRouterContext = createContext<DataRouterContextObject | null>(null);

export const DataRouterStateContext = createContext<Router['state'] | null>(null);

export const RSCRouterContext = createContext<boolean>(false);

export function useIsRSCRouterContext(): boolean {
	return useContext(RSCRouterContext);
}

export type ViewTransitionContextObject =
	| {
			isTransitioning: false;
	  }
	| {
			isTransitioning: true;
			flushSync: boolean;
			currentLocation: Location;
			nextLocation: Location;
	  };

export const ViewTransitionContext = createContext<ViewTransitionContextObject>({
	isTransitioning: false,
});

// TODO: (v7) Change the useFetcher data from `any` to `unknown`
export type FetchersContextObject = Map<string, any>;

export const FetchersContext = createContext<FetchersContextObject>(new Map());

export const AwaitContext = createContext<TrackedPromise | null>(null);

export const AwaitContextProvider = (props: { value: TrackedPromise | null; children?: unknown }) =>
	createElement(AwaitContext.Provider as any, props);

export interface NavigateOptions {
	/** Replace the current entry in the history stack instead of pushing a new one */
	replace?: boolean;
	/** Masked URL */
	mask?: To;
	/** Adds persistent client side routing state to the next location */
	state?: any;
	/** Prevent the scroll position from being reset to the top of the window on navigate */
	preventScrollReset?: boolean;
	/** Defines the relative path behavior for the link */
	relative?: RelativeRoutingType;
	/** Wrap the initial state update in flushSync instead of startTransition */
	flushSync?: boolean;
	/** Enable a View Transition for this navigation */
	viewTransition?: boolean;
	/** Specifies the default revalidation behavior after this submission */
	defaultShouldRevalidate?: boolean;
}

/**
 * A Navigator is a "location changer"; it's how you get to different locations.
 *
 * Every history instance conforms to the Navigator interface, but the
 * distinction is useful primarily when it comes to the low-level `<Router>` API
 * where both the location and a navigator must be provided separately in order
 * to avoid "tearing" that may occur in a suspense-enabled app if the action
 * and/or location were to be read directly from the history instance.
 */
export interface Navigator {
	createHref: History['createHref'];
	// Optional for backwards-compat with Router/HistoryRouter usage (edge case)
	encodeLocation?: History['encodeLocation'];
	go: History['go'];
	push(to: To, state?: any, opts?: NavigateOptions): void;
	replace(to: To, state?: any, opts?: NavigateOptions): void;
}

interface NavigationContextObject {
	basename: string;
	navigator: Navigator;
	static: boolean;
	useTransitions: boolean | undefined;
	future: {};
}

export const NavigationContext = createContext<NavigationContextObject>(null!);

interface LocationContextObject {
	location: Location;
	navigationType: NavigationType;
}

export const LocationContext = createContext<LocationContextObject>(null!);

export interface RouteContextObject {
	outlet: unknown | null;
	matches: RouteMatch[];
	isDataRoute: boolean;
}

export const RouteContext = createContext<RouteContextObject>({
	outlet: null,
	matches: [],
	isDataRoute: false,
});

export const RouteErrorContext = createContext<any>(null);

export const ENABLE_DEV_WARNINGS = process.env.NODE_ENV !== 'production';
