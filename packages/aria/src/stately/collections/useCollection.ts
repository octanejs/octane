// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/collections/useCollection.ts).
// octane adaptations: React element types → `any` descriptors; public-hook slot
// threading; explicit dependency arrays kept verbatim.
import type { Collection, CollectionStateBase, Node } from '@react-types/shared';
import { useMemo } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { CollectionBuilder } from './CollectionBuilder';

interface CollectionOptions<T, C extends Collection<Node<T>>> extends Omit<
	CollectionStateBase<T, C>,
	'children'
> {
	children?: any;
}

type CollectionFactory<T, C extends Collection<Node<T>>> = (node: Iterable<Node<T>>) => C;

export function useCollection<
	T extends object,
	C extends Collection<Node<T>> = Collection<Node<T>>,
>(props: CollectionOptions<T, C>, factory: CollectionFactory<T, C>, context?: unknown): C;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useCollection<
	T extends object,
	C extends Collection<Node<T>> = Collection<Node<T>>,
>(
	props: CollectionOptions<T, C>,
	factory: CollectionFactory<T, C>,
	context: unknown,
	slot: symbol | undefined,
): C;
export function useCollection(...args: any[]): any {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useCollection');
	const props = user[0] as CollectionOptions<any, any>;
	const factory = user[1] as CollectionFactory<any, any>;
	const context = user[2];

	let builder = useMemo(() => new CollectionBuilder<any>(), [], subSlot(slot, 'builder'));
	let { children, items, collection } = props as any;
	let result = useMemo(
		() => {
			if (collection) {
				return collection;
			}
			let nodes = builder.build({ children, items }, context);
			return factory(nodes);
		},
		[builder, children, items, collection, context, factory],
		subSlot(slot, 'collection'),
	);
	return result;
}
