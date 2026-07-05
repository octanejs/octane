// Ported from .base-ui/packages/react/src/internals/composite/item/useCompositeItem.ts.
// Gives a composite item its roving `tabIndex` (0 when highlighted, -1 otherwise) and the
// focus/hover handlers that move the highlight. `useMergedRefs` → octane `useComposedRefs`.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useRef } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { useComposedRefs } from '../composeRefs';
import { useCompositeRootContext } from '../CompositeRootContext';
import { useCompositeListItem, type UseCompositeListItemParameters } from './useCompositeListItem';

export interface UseCompositeItemParameters<Metadata> extends Pick<
	UseCompositeListItemParameters<Metadata>,
	'metadata' | 'indexGuessBehavior'
> {}

export function useCompositeItem<Metadata>(...args: any[]): {
	compositeProps: Record<string, any>;
	compositeRef: (node: HTMLElement | null) => void;
	index: number;
} {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useCompositeItem');
	const params = (user[0] as UseCompositeItemParameters<Metadata>) ?? {};

	const { highlightItemOnHover, highlightedIndex, onHighlightedIndexChange } =
		useCompositeRootContext();
	const { ref, index } = useCompositeListItem(params, subSlot(slot, 'li'));

	const isHighlighted = highlightedIndex === index;

	const itemRef = useRef<HTMLElement | null>(null, subSlot(slot, 'itemRef'));
	const mergedRef = useComposedRefs(ref, itemRef, subSlot(slot, 'merged'));

	const compositeProps: Record<string, any> = {
		tabIndex: isHighlighted ? 0 : -1,
		onFocus() {
			onHighlightedIndexChange(index);
		},
		onMouseMove() {
			const item = itemRef.current;
			if (!highlightItemOnHover || !item) {
				return;
			}
			const disabled = item.hasAttribute('disabled') || (item as any).ariaDisabled === 'true';
			if (!isHighlighted && !disabled) {
				item.focus();
			}
		},
	};

	return {
		compositeProps,
		compositeRef: mergedRef as (node: HTMLElement | null) => void,
		index,
	};
}
