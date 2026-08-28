import { useLinkedState } from 'octane';
import type { AnyVariables, DocumentInput, GraphQLRequest } from '@urql/core';
import { createRequest } from '@urql/core';
import { splitSlot, subSlot } from '../internal';

/** Creates a request from a query and variables but preserves reference equality if the key isn't changing
 * @internal
 */
export function useRequest<Data = any, Variables extends AnyVariables = AnyVariables>(
	query: DocumentInput<Data, Variables>,
	variables: Variables,
	...rest: [slot?: symbol]
): GraphQLRequest<Data, Variables> {
	const [, slot] = splitSlot(rest);
	const [request] = useLinkedState<
		readonly [DocumentInput<Data, Variables>, Variables],
		GraphQLRequest<Data, Variables>
	>(
		[query, variables] as const,
		function reconcileRequest(source, previous) {
			const nextRequest = createRequest<Data, Variables>(source[0], source[1]);
			return previous !== undefined && previous.value.key === nextRequest.key
				? previous.value
				: nextRequest;
		},
		{
			sourceEqual(previous, next) {
				return previous[0] === next[0] && previous[1] === next[1];
			},
		},
		subSlot(slot, 'request'),
	);
	return request;
}
