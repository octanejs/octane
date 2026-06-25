// Type declaration for the .tsrx provider component (QueryClientProvider.tsrx).
// It's a SPECIFIC module declaration (resolved by relative path), not an ambient
// `declare module '*.tsrx'` — so it types only this module and doesn't pollute a
// consumer's own .tsrx imports. The runtime resolves the real compiled .tsrx.
import type { QueryClient } from '@tanstack/query-core';

export declare const QueryClientProvider: (props: {
	client: QueryClient;
	children?: unknown;
}) => unknown;
