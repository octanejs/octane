import type { OctaneNode } from 'octane';
import type { AnyVariables } from '@urql/core';

import type { UseQueryArgs, UseQueryState, UseQueryExecute } from '../hooks';
import { useQuery } from '../hooks';
import { splitSlot, subSlot } from '../internal';

export type QueryProps<Data = any, Variables extends AnyVariables = AnyVariables> = UseQueryArgs<
	Variables,
	Data
> & {
	children(arg: QueryState<Data, Variables>): OctaneNode;
};

export interface QueryState<
	Data = any,
	Variables extends AnyVariables = AnyVariables,
> extends UseQueryState<Data, Variables> {
	executeQuery: UseQueryExecute;
}

export function Query<Data = any, Variables extends AnyVariables = AnyVariables>(
	props: QueryProps<Data, Variables>,
	...rest: unknown[]
): OctaneNode {
	const [, slot] = splitSlot(rest);
	const query = useQuery<Data, Variables>(props, subSlot(slot, 'query'));
	return props.children({ ...query[0], executeQuery: query[1] });
}
