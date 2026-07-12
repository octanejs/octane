// Type declaration for the .tsrx component (resolved by relative path).
import type { Router as DataRouter } from '../router/router';
import type { ClientOnErrorFunction } from '../context';

export declare const RouterProvider: (props: {
	router: DataRouter;
	flushSync?: (fn: () => unknown) => undefined;
	onError?: ClientOnErrorFunction;
	useTransitions?: boolean;
}) => unknown;

export declare const Outlet: (props: { context?: unknown }) => unknown;

export declare const DataRoutes: (props: {
	routes: any[];
	manifest: any;
	future: any;
	state: any;
	isStatic: boolean;
	onError?: ClientOnErrorFunction;
}) => unknown;
