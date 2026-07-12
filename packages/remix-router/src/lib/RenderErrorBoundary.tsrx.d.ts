// Type declaration for the .tsrx component (resolved by relative path).
import type { Location } from './router/history';
import type { RevalidationState } from './router/router';
import type { RouteContextObject } from './context';

export declare const RenderErrorBoundary: (props: {
	location: Location;
	revalidation: RevalidationState;
	error: any;
	component: unknown;
	routeContext: RouteContextObject;
	onError?: (error: unknown, errorInfo?: unknown) => void;
	children?: unknown;
}) => unknown;
