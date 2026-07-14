import type { ApolloClient, OperationVariables } from '@apollo/client';
export declare function validateSuspenseHookOptions<TData, TVariables extends OperationVariables>(
	options: ApolloClient.WatchQueryOptions<TData, TVariables>,
): void;
