// Type declaration for the .tsrx component (resolved by relative path).
import type { AnyRouter } from '@tanstack/router-core';

export type RouterProps = {
	router: AnyRouter;
	context?: Record<string, any>;
} & Record<string, any>;

export declare const RouterProvider: (props: RouterProps) => unknown;
export declare const RouterContextProvider: (
	props: RouterProps & { children?: unknown },
) => unknown;
