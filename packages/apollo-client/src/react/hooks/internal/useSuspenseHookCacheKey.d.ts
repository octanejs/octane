import type { DocumentNode } from 'graphql';
import type { OperationVariables } from '@apollo/client';
import type { SkipToken } from '../constants.js';
export declare namespace useSuspenseHookCacheKey {
	interface Options {
		variables?: OperationVariables;
		queryKey?: string | number | any[];
	}
}
export declare function useSuspenseHookCacheKey(
	query: DocumentNode,
	options: (SkipToken & Partial<useSuspenseHookCacheKey.Options>) | useSuspenseHookCacheKey.Options,
): [DocumentNode, string, ...any[]];
