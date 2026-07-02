// Ported from @radix-ui/react-collection (the "legacy" createCollection the shipped
// primitives use — Accordion, Toolbar, RovingFocusGroup, …). A Provider owns an item map;
// `Collection.Slot` marks the collection root element (via ref); `Collection.ItemSlot`
// stamps `data-radix-collection-item` on its child + registers it; `useCollection`
// returns the registered items sorted by DOM order. React's forwardRef/createSlot →
// octane ref-as-prop + our `Slot`.
import { createElement, useEffect, useRef } from 'octane';

import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { S, splitSlot, subSlot } from './internal';
import { Slot } from './Slot';

const ITEM_DATA_ATTR = 'data-radix-collection-item';

interface CollectionContextValue {
	collectionRef: { current: HTMLElement | null };
	itemMap: Map<{ current: HTMLElement | null }, { ref: { current: HTMLElement | null } }>;
}

export function createCollection(name: string): [
	{
		Provider: (props: any) => any;
		Slot: (props: any) => any;
		ItemSlot: (props: any) => any;
	},
	(scope: any, ...slot: any[]) => () => any[],
	any,
] {
	const PROVIDER_NAME = name + 'CollectionProvider';
	const [createCollectionContext, createCollectionScope] = createContextScope(PROVIDER_NAME);
	const [CollectionProviderImpl, useCollectionContext] =
		createCollectionContext<CollectionContextValue>(PROVIDER_NAME, {
			collectionRef: { current: null },
			itemMap: new Map(),
		});

	function CollectionProvider(props: any): any {
		const slot = S(PROVIDER_NAME);
		const { scope, children } = props;
		const ref = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
		const itemMap = useRef(new Map(), subSlot(slot, 'map')).current;
		return createElement(CollectionProviderImpl, { scope, itemMap, collectionRef: ref, children });
	}

	function CollectionSlot(props: any): any {
		const slot = S(name + 'CollectionSlot');
		const { scope, children, ref: forwardedRef } = props;
		const context = useCollectionContext(name + 'CollectionSlot', scope);
		const composedRefs = useComposedRefs(
			forwardedRef,
			context.collectionRef,
			subSlot(slot, 'refs'),
		);
		return createElement(Slot, { ref: composedRefs, children });
	}

	function CollectionItemSlot(props: any): any {
		const slot = S(name + 'CollectionItemSlot');
		const { scope, children, ref: forwardedRef, ...itemData } = props;
		const ref = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
		const composedRefs = useComposedRefs(forwardedRef, ref, subSlot(slot, 'refs'));
		const context = useCollectionContext(name + 'CollectionItemSlot', scope);
		// No deps (React parity): re-register every render so itemData stays fresh.
		useEffect(
			() => {
				context.itemMap.set(ref, { ref, ...itemData });
				return () => void context.itemMap.delete(ref);
			},
			undefined,
			subSlot(slot, 'e:reg'),
		);
		return createElement(Slot, { [ITEM_DATA_ATTR]: '', ref: composedRefs, children });
	}

	function useCollection(...args: any[]): () => any[] {
		const [user, slotArg] = splitSlot(args);
		const scope = user[0];
		void slotArg;
		const context = useCollectionContext(name + 'CollectionConsumer', scope);
		return () => {
			const collectionNode = context.collectionRef.current;
			if (!collectionNode) return [];
			const orderedNodes = Array.from(collectionNode.querySelectorAll(`[${ITEM_DATA_ATTR}]`));
			const items = Array.from(context.itemMap.values());
			return items.sort(
				(a, b) => orderedNodes.indexOf(a.ref.current!) - orderedNodes.indexOf(b.ref.current!),
			);
		};
	}

	return [
		{ Provider: CollectionProvider, Slot: CollectionSlot, ItemSlot: CollectionItemSlot },
		useCollection,
		createCollectionScope,
	];
}
