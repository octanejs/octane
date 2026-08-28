import { pipe, subscribe, onEnd } from 'wonka';
import { useCallback, useEffect, useLinkedState, useMemo, useRef } from 'octane';

import type {
	GraphQLRequestParams,
	AnyVariables,
	CombinedError,
	OperationContext,
	Operation,
} from '@urql/core';

import { useClient } from '../context';
import { useRequest } from './useRequest';
import { splitSlot, subSlot } from '../internal';

import { deferDispatch, initialState, computeNextState, hasDepsChanged } from './state';

export type UseSubscriptionArgs<Variables extends AnyVariables = AnyVariables, Data = any> = {
	pause?: boolean;
	context?: Partial<OperationContext>;
} & GraphQLRequestParams<Data, Variables>;

export type SubscriptionHandler<T, R> = (prev: R | undefined, data: T) => R;

export interface UseSubscriptionState<Data = any, Variables extends AnyVariables = AnyVariables> {
	fetching: boolean;
	stale: boolean;
	data?: Data;
	error?: CombinedError;
	extensions?: Record<string, any>;
	operation?: Operation<Data, Variables>;
}

export type UseSubscriptionExecute = (opts?: Partial<OperationContext>) => void;

export type UseSubscriptionResponse<Data = any, Variables extends AnyVariables = AnyVariables> = [
	UseSubscriptionState<Data, Variables>,
	UseSubscriptionExecute,
];

export function useSubscription<
	Data = any,
	Result = Data,
	Variables extends AnyVariables = AnyVariables,
>(
	args: UseSubscriptionArgs<Variables, Data>,
	...rest: [handler?: SubscriptionHandler<Data, Result>, slot?: symbol]
): UseSubscriptionResponse<Result, Variables> {
	const [user, slot] = splitSlot(rest);
	const handler = user[0] as SubscriptionHandler<Data, Result> | undefined;
	const client = useClient(subSlot(slot, 'client'));
	const request = useRequest(args.query, args.variables as Variables, subSlot(slot, 'request'));

	const handlerRef = useRef<SubscriptionHandler<Data, Result> | undefined>(
		handler,
		subSlot(slot, 'handler'),
	);
	handlerRef.current = handler;

	const source = useMemo(
		function memoSource() {
			return !args.pause ? client.executeSubscription(request, args.context) : null;
		},
		[client, request, args.pause, args.context],
		subSlot(slot, 'source'),
	);

	const deps = [client, request, args.context, args.pause] as const;
	type SubscriptionSource = typeof source;
	type SubscriptionDeps = typeof deps;
	type SubscriptionResultState = UseSubscriptionState<any, Variables> & { hasNext: boolean };
	type SubscriptionState = readonly [SubscriptionSource, SubscriptionResultState, SubscriptionDeps];
	type SubscriptionLinkedSource = readonly [SubscriptionSource, SubscriptionDeps];

	const [state, setState] = useLinkedState<SubscriptionLinkedSource, SubscriptionState>(
		[source, deps] as const,
		function reconcileState(next, previous) {
			const previousResult: SubscriptionResultState =
				previous === undefined ? initialState : previous.value[1];
			return [next[0], computeNextState(previousResult, { fetching: !!next[0] }), next[1]] as const;
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
			function updateResult(result: Partial<UseSubscriptionState<Data, Variables>>) {
				deferDispatch(setState, function reduce(prev) {
					const nextResult = computeNextState(prev[1], result);
					if (prev[1] === nextResult) return prev;
					if (handlerRef.current && nextResult.data != null && prev[1].data !== nextResult.data) {
						nextResult.data = handlerRef.current(prev[1].data, nextResult.data) as any;
					}

					return [prev[0], nextResult as any, prev[2]];
				});
			}

			if (state[0]) {
				return pipe(
					state[0],
					onEnd(function onEnded() {
						updateResult({ fetching: !!source });
					}),
					subscribe(updateResult),
				).unsubscribe;
			} else {
				updateResult({ fetching: false });
			}
		},
		[state[0]],
		subSlot(slot, 'effect'),
	);

	const executeSubscription = useCallback(
		function executeSubscriptionFn(opts?: Partial<OperationContext>) {
			const nextSource = client.executeSubscription(request, {
				...args.context,
				...opts,
			});

			deferDispatch(setState, function reduce(prev) {
				return [nextSource, prev[1], deps];
			});
		},
		[client, request, args.context, args.pause],
		subSlot(slot, 'execute'),
	);

	return [state[1], executeSubscription];
}
