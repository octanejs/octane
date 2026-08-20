import type { OctaneNode } from 'octane';
import type { AnyVariables, DocumentInput } from '@urql/core';

import type { UseMutationState, UseMutationExecute } from '../hooks';
import { useMutation } from '../hooks';
import { splitSlot, subSlot } from '../internal';

export interface MutationProps<Data = any, Variables extends AnyVariables = AnyVariables> {
	query: DocumentInput<Data, Variables>;
	children(arg: MutationState<Data, Variables>): OctaneNode;
}

export interface MutationState<Data = any, Variables extends AnyVariables = AnyVariables>
	extends UseMutationState<Data, Variables> {
	executeMutation: UseMutationExecute<Data, Variables>;
}

export function Mutation<Data = any, Variables extends AnyVariables = AnyVariables>(
	props: MutationProps<Data, Variables>,
	...rest: unknown[]
): OctaneNode {
	const [, slot] = splitSlot(rest);
	const mutation = useMutation<Data, Variables>(props.query, subSlot(slot, 'mutation'));
	return props.children({ ...mutation[0], executeMutation: mutation[1] });
}
