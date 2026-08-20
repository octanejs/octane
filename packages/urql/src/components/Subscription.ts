import type { OctaneNode } from 'octane';
import type { AnyVariables } from '@urql/core';

import type {
	UseSubscriptionArgs,
	UseSubscriptionState,
	UseSubscriptionExecute,
	SubscriptionHandler,
} from '../hooks';
import { useSubscription } from '../hooks';
import { splitSlot, subSlot } from '../internal';

export type SubscriptionProps<
	Data = any,
	Result = Data,
	Variables extends AnyVariables = AnyVariables,
> = UseSubscriptionArgs<Variables, Data> & {
	handler?: SubscriptionHandler<Data, Result>;
	children(arg: SubscriptionState<Result, Variables>): OctaneNode;
};

export interface SubscriptionState<Data = any, Variables extends AnyVariables = AnyVariables>
	extends UseSubscriptionState<Data, Variables> {
	executeSubscription: UseSubscriptionExecute;
}

export function Subscription<
	Data = any,
	Result = Data,
	Variables extends AnyVariables = AnyVariables,
>(props: SubscriptionProps<Data, Result, Variables>, ...rest: unknown[]): OctaneNode {
	const [, slot] = splitSlot(rest);
	const subscription = useSubscription<Data, Result, Variables>(
		props,
		props.handler,
		subSlot(slot, 'subscription'),
	);

	return props.children({
		...subscription[0],
		executeSubscription: subscription[1],
	});
}
