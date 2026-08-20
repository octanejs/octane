import { useMemo, useRef } from 'octane';
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
	const prev = useRef<undefined | GraphQLRequest<Data, Variables>>(
		undefined,
		subSlot(slot, 'prev'),
	);

	return useMemo(
		function memoRequest() {
			const request = createRequest<Data, Variables>(query, variables);
			if (prev.current !== undefined && prev.current.key === request.key) {
				return prev.current;
			} else {
				prev.current = request;
				return request;
			}
		},
		[query, variables],
		subSlot(slot, 'memo'),
	);
}
