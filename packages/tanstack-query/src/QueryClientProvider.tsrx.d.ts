// Declaration companion for this module only.
import type { QueryClient } from '@tanstack/query-core';

export declare const QueryClientProvider: (props: {
	client: QueryClient;
	children?: unknown;
}) => unknown;
