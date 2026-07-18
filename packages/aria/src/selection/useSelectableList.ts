// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/selection/useSelectableList.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; explicit dependency arrays are kept verbatim; `DOMAttributes` is a local
// structural prop-bag alias (upstream's is typed over React's synthetic handlers).
import {
	type AriaSelectableCollectionOptions,
	useSelectableCollection,
} from './useSelectableCollection';
import type {
	Collection,
	Key,
	KeyboardDelegate,
	LayoutDelegate,
	Node,
	Orientation,
} from '@react-types/shared';
import { ListKeyboardDelegate } from './ListKeyboardDelegate';
import { useCollator } from '../i18n/useCollator';
import { useMemo } from 'octane';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface AriaSelectableListOptions extends Omit<
	AriaSelectableCollectionOptions,
	'keyboardDelegate'
> {
	/**
	 * State of the collection.
	 */
	collection: Collection<Node<unknown>>;
	/**
	 * A delegate object that implements behavior for keyboard focus movement.
	 */
	keyboardDelegate?: KeyboardDelegate;
	/**
	 * A delegate object that provides layout information for items in the collection.
	 * By default this uses the DOM, but this can be overridden to implement things like
	 * virtualized scrolling.
	 */
	layoutDelegate?: LayoutDelegate;
	/**
	 * The item keys that are disabled. These items cannot be selected, focused, or otherwise
	 * interacted with.
	 */
	disabledKeys: Set<Key>;
	/**
	 * The primary orientation of the items. Usually this is the direction that the collection
	 * scrolls.
	 *
	 * @default 'vertical'
	 */
	orientation?: Orientation;
}

export interface SelectableListAria {
	/**
	 * Props for the option element.
	 */
	listProps: DOMAttributes;
}

/**
 * Handles interactions with a selectable list.
 */
export function useSelectableList(props: AriaSelectableListOptions): SelectableListAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useSelectableList(
	props: AriaSelectableListOptions,
	slot: symbol | undefined,
): SelectableListAria;
export function useSelectableList(...args: any[]): SelectableListAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useSelectableList');
	const props = user[0] as AriaSelectableListOptions;

	let {
		selectionManager,
		collection,
		disabledKeys,
		ref,
		keyboardDelegate,
		layoutDelegate,
		orientation,
	} = props;

	// By default, a KeyboardDelegate is provided which uses the DOM to query layout information (e.g. for page up/page down).
	// When virtualized, the layout object will be passed in as a prop and override this.
	let collator = useCollator({ usage: 'search', sensitivity: 'base' }, subSlot(slot, 'collator'));
	let disabledBehavior = selectionManager.disabledBehavior;
	let delegate = useMemo(
		() =>
			keyboardDelegate ||
			new ListKeyboardDelegate({
				collection,
				disabledKeys,
				disabledBehavior,
				ref,
				collator,
				layoutDelegate,
				orientation,
			}),
		[
			keyboardDelegate,
			layoutDelegate,
			collection,
			disabledKeys,
			ref,
			collator,
			disabledBehavior,
			orientation,
		],
		subSlot(slot, 'delegate'),
	);

	let { collectionProps } = useSelectableCollection(
		{
			...props,
			ref,
			selectionManager,
			keyboardDelegate: delegate,
		},
		subSlot(slot, 'collection'),
	);

	return {
		listProps: collectionProps,
	};
}
