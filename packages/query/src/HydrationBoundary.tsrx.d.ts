// Type declaration for the .tsrx component (resolved by relative path).
import type { DehydratedState, HydrateOptions, QueryClient } from '@tanstack/query-core';

export declare const HydrationBoundary: (props: {
	state: DehydratedState | null | undefined;
	options?: HydrateOptions;
	children?: unknown;
	queryClient?: QueryClient;
}) => unknown;
