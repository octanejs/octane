// Ported from .base-ui/packages/react/src/internals/composite/list/useCompositeListItem.ts.
// Registers a list item with the CompositeList and resolves its DOM-order `index` (via the
// list's `subscribeMapChange`), stashing the element in `elementsRef[index]`.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useCallback, useLayoutEffect, useRef, useState } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { useCompositeListContext } from './CompositeListContext';

export enum IndexGuessBehavior {
	None,
	GuessFromOrder,
}

export interface UseCompositeListItemParameters<Metadata> {
	index?: number;
	label?: string | null;
	metadata?: Metadata;
	textRef?: { current: HTMLElement | null };
	indexGuessBehavior?: IndexGuessBehavior;
}

export interface UseCompositeListItemReturnValue {
	ref: (node: HTMLElement | null) => void;
	index: number;
}

export function useCompositeListItem<Metadata>(...args: any[]): UseCompositeListItemReturnValue {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useCompositeListItem');
	const params = (user[0] as UseCompositeListItemParameters<Metadata>) ?? {};
	const { label, metadata, textRef, indexGuessBehavior, index: externalIndex } = params;

	const { register, unregister, subscribeMapChange, elementsRef, labelsRef, nextIndexRef } =
		useCompositeListContext();

	const indexRef = useRef(-1, subSlot(slot, 'idxRef'));
	const [index, setIndex] = useState<number>(
		externalIndex ??
			(indexGuessBehavior === IndexGuessBehavior.GuessFromOrder
				? () => {
						if (indexRef.current === -1) {
							const newIndex = nextIndexRef.current;
							nextIndexRef.current += 1;
							indexRef.current = newIndex;
						}
						return indexRef.current;
					}
				: -1),
		subSlot(slot, 'idx'),
	);

	const componentRef = useRef<Element | null>(null, subSlot(slot, 'node'));

	const ref = useCallback(
		(node: HTMLElement | null) => {
			componentRef.current = node;
			if (index !== -1 && node !== null) {
				elementsRef.current[index] = node;
				if (labelsRef) {
					const isLabelDefined = label !== undefined;
					labelsRef.current[index] = isLabelDefined
						? (label as string | null)
						: (textRef?.current?.textContent ?? node.textContent);
				}
			}
		},
		[index, elementsRef, labelsRef, label, textRef],
		subSlot(slot, 'ref'),
	);

	useLayoutEffect(
		() => {
			if (externalIndex != null) {
				return undefined;
			}
			const node = componentRef.current;
			if (node) {
				register(node, metadata as Metadata);
				return () => {
					unregister(node);
				};
			}
			return undefined;
		},
		[externalIndex, register, unregister, metadata],
		subSlot(slot, 'e:reg'),
	);

	useLayoutEffect(
		() => {
			if (externalIndex != null) {
				return undefined;
			}
			return subscribeMapChange((map) => {
				const i = componentRef.current ? map.get(componentRef.current)?.index : null;
				if (i != null) {
					setIndex(i);
				}
			});
		},
		[externalIndex, subscribeMapChange, setIndex],
		subSlot(slot, 'e:sub'),
	);

	return { ref, index };
}
