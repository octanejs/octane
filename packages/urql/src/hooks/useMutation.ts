import { useCallback, useEffect, useRef, useState } from 'octane';
import { pipe, onPush, filter, toPromise, take } from 'wonka';

import type {
	AnyVariables,
	DocumentInput,
	OperationResult,
	OperationContext,
	CombinedError,
	Operation,
} from '@urql/core';
import { createRequest } from '@urql/core';

import { useClient } from '../context';
import { splitSlot, subSlot } from '../internal';
import { deferDispatch, initialState } from './state';

export interface UseMutationState<Data = any, Variables extends AnyVariables = AnyVariables> {
	fetching: boolean;
	stale: boolean;
	data?: Data;
	error?: CombinedError;
	extensions?: Record<string, any>;
	hasNext: boolean;
	operation?: Operation<Data, Variables>;
}

export type UseMutationExecute<Data = any, Variables extends AnyVariables = AnyVariables> = (
	variables: Variables,
	context?: Partial<OperationContext>,
) => Promise<OperationResult<Data, Variables>>;

export type UseMutationResponse<Data = any, Variables extends AnyVariables = AnyVariables> = [
	UseMutationState<Data, Variables>,
	UseMutationExecute<Data, Variables>,
];

export function useMutation<Data = any, Variables extends AnyVariables = AnyVariables>(
	query: DocumentInput<Data, Variables>,
	...rest: [slot?: symbol]
): UseMutationResponse<Data, Variables> {
	const [, slot] = splitSlot(rest);
	const isMounted = useRef(true, subSlot(slot, 'mounted'));
	const client = useClient(subSlot(slot, 'client'));

	const [state, setState] = useState<UseMutationState<Data, Variables>>(
		initialState,
		subSlot(slot, 'state'),
	);

	const executeMutation = useCallback(
		function executeMutationFn(variables: Variables, context?: Partial<OperationContext>) {
			deferDispatch(setState, { ...initialState, fetching: true });
			return pipe(
				client.executeMutation<Data, Variables>(
					createRequest<Data, Variables>(query, variables),
					context || {},
				),
				onPush(function applyResult(result) {
					if (isMounted.current) {
						deferDispatch(setState, {
							fetching: false,
							stale: result.stale,
							data: result.data,
							error: result.error,
							extensions: result.extensions,
							operation: result.operation,
							hasNext: result.hasNext,
						});
					}
				}),
				filter(function withoutNext(result) {
					return !result.hasNext;
				}),
				take(1),
				toPromise,
			);
		},
		[client, query, setState],
		subSlot(slot, 'execute'),
	);

	useEffect(
		function trackMounted() {
			isMounted.current = true;
			return function unmount() {
				isMounted.current = false;
			};
		},
		[],
		subSlot(slot, 'effect'),
	);

	return [state, executeMutation];
}
