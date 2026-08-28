import type { Source } from 'wonka';
import { pipe, subscribe, onEnd, onPush, takeWhile } from 'wonka';
import { useCallback, useEffect, useLinkedState, useMemo } from 'octane';

import type {
	GraphQLRequestParams,
	AnyVariables,
	Client,
	CombinedError,
	OperationContext,
	RequestPolicy,
	OperationResult,
	Operation,
} from '@urql/core';

import { useClient } from '../context';
import { useRequest } from './useRequest';
import { getCacheForClient } from './cache';
import { splitSlot, subSlot } from '../internal';

import { deferDispatch, initialState, computeNextState, hasDepsChanged } from './state';

export type UseQueryArgs<Variables extends AnyVariables = AnyVariables, Data = any> = {
	requestPolicy?: RequestPolicy;
	context?: Partial<OperationContext>;
	pause?: boolean;
} & GraphQLRequestParams<Data, Variables>;

export interface UseQueryState<Data = any, Variables extends AnyVariables = AnyVariables> {
	fetching: boolean;
	stale: boolean;
	data?: Data;
	error?: CombinedError;
	hasNext: boolean;
	extensions?: Record<string, any>;
	operation?: Operation<Data, Variables>;
}

export type UseQueryExecute = (opts?: Partial<OperationContext>) => void;

export type UseQueryResponse<Data = any, Variables extends AnyVariables = AnyVariables> = [
	UseQueryState<Data, Variables>,
	UseQueryExecute,
];

function isSuspense(client: Client, context?: Partial<OperationContext>) {
	return context && context.suspense !== undefined ? !!context.suspense : client.suspense;
}

/**
 * Hook to run a GraphQL query and get updated GraphQL results.
 *
 * OCTANE DIVERGENCE: the suspense path still throws a Promise, matching
 * upstream urql, rather than wrapping it in Octane `use()`. Keep that throw
 * so existing suspense/cache timing stays aligned with the pinned React binding.
 */
export function useQuery<Data = any, Variables extends AnyVariables = AnyVariables>(
	args: UseQueryArgs<Variables, Data>,
	...rest: [slot?: symbol]
): UseQueryResponse<Data, Variables> {
	const [, slot] = splitSlot(rest);
	const client = useClient(subSlot(slot, 'client'));
	const cache = getCacheForClient(client);
	const suspense = isSuspense(client, args.context);
	const request = useRequest(args.query, args.variables as Variables, subSlot(slot, 'request'));

	const source = useMemo(
		function memoSource() {
			if (args.pause) return null;

			const nextSource = client.executeQuery(request, {
				requestPolicy: args.requestPolicy,
				...args.context,
			});

			return suspense
				? pipe(
						nextSource,
						onPush(function cacheResult(result) {
							cache.set(request.key, result);
						}),
					)
				: nextSource;
		},
		[cache, client, request, suspense, args.pause, args.requestPolicy, args.context],
		subSlot(slot, 'source'),
	);

	const getSnapshot = useCallback(
		function getSnapshotFn(
			currentSource: Source<OperationResult<Data, Variables>> | null,
			currentSuspense: boolean,
		): Partial<UseQueryState<Data, Variables>> {
			if (!currentSource) return { fetching: false };

			let result = cache.get(request.key);
			if (!result) {
				let resolve: (value: unknown) => void;

				const subscription = pipe(
					currentSource,
					takeWhile(function keepTaking() {
						return (
							(currentSuspense && !resolve) || !result || ('hasNext' in result && result.hasNext)
						);
					}),
					subscribe(function onResult(_result) {
						result = _result;
						if (resolve) resolve(result);
					}),
				);

				if (result == null && currentSuspense) {
					const promise = new Promise(function pending(_resolve) {
						resolve = _resolve;
					});

					cache.set(request.key, promise);
					throw promise;
				} else {
					subscription.unsubscribe();
				}
			} else if (currentSuspense && result != null && 'then' in result) {
				throw result;
			}

			if (currentSuspense && result != null && !('then' in result) && result.error) {
				const errorResult = result;
				queueMicrotask(function clearCachedError() {
					if (cache.get(request.key) === errorResult) {
						cache.clear(request.key);
					}
				});
			}

			return (result as OperationResult<Data, Variables>) || { fetching: true };
		},
		[cache, request],
		subSlot(slot, 'snapshot'),
	);

	const deps = [client, request, args.requestPolicy, args.context, args.pause] as const;
	type QuerySource = Source<OperationResult<Data, Variables>> | null;
	type QueryDeps = typeof deps;
	type QueryState = readonly [QuerySource, UseQueryState<Data, Variables>, QueryDeps];
	type QueryLinkedSource = readonly [QuerySource, QueryDeps, boolean, typeof getSnapshot];

	const [state, setState] = useLinkedState<QueryLinkedSource, QueryState>(
		[source, deps, suspense, getSnapshot] as const,
		function reconcileState(next, previous) {
			const previousResult: UseQueryState<Data, Variables> =
				previous === undefined ? initialState : previous.value[1];
			return [
				next[0],
				computeNextState(
					previousResult,
					deferDispatch(function read() {
						return next[3](next[0], next[2]);
					}),
				),
				next[1],
			] as const;
		},
		{
			sourceEqual(previous, next) {
				return previous[0] === next[0] && !hasDepsChanged(previous[1], next[1]);
			},
		},
		subSlot(slot, 'state'),
	);

	useEffect(
		function subscribeSource() {
			const currentSource = state[0];
			const currentRequest = state[2][1];

			let hasResult = false;

			function updateResult(result: Partial<UseQueryState<Data, Variables>>) {
				hasResult = true;
				deferDispatch(setState, function reduce(prev) {
					const nextResult = computeNextState(prev[1], result);
					return prev[1] !== nextResult ? [prev[0], nextResult, prev[2]] : prev;
				});
			}

			if (currentSource) {
				const subscription = pipe(
					currentSource,
					onEnd(function onEnded() {
						updateResult({ fetching: false });
					}),
					subscribe(updateResult),
				);

				if (!hasResult) updateResult({ fetching: true });

				return function cleanup() {
					cache.dispose(currentRequest.key);
					subscription.unsubscribe();
				};
			} else {
				updateResult({ fetching: false });
			}
		},
		[cache, state[0], state[2][1]],
		subSlot(slot, 'effect'),
	);

	const executeQuery = useCallback(
		function executeQueryFn(opts?: Partial<OperationContext>) {
			const context = {
				requestPolicy: args.requestPolicy,
				...args.context,
				...opts,
			};

			deferDispatch(setState, function reduce(prev) {
				const nextSource = suspense
					? pipe(
							client.executeQuery(request, context),
							onPush(function cacheResult(result) {
								cache.set(request.key, result);
							}),
						)
					: client.executeQuery(request, context);
				return [nextSource, prev[1], deps];
			});
		},
		[client, cache, request, suspense, args.requestPolicy, args.context, args.pause],
		subSlot(slot, 'execute'),
	);

	return [state[1], executeQuery];
}
