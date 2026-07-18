// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/menu/useMenu.ts).
// octane adaptations:
// - `KeyboardEvents` is the ported NATIVE-event version (from useKeyboard); the menu-level
//   onKeyDown wrapper receives the native KeyboardEvent; `DOMAttributes` is a local
//   structural prop-bag alias (upstream's is typed over React's synthetic handlers).
// - `TreeState` type from the ported stately tree state.
// - The dev-only missing-label console.warn is not ported (repo policy, per useLabel).
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention.
import type {
	AriaLabelingProps,
	CollectionBase,
	DOMProps,
	FocusStrategy,
	Key,
	KeyboardDelegate,
	MultipleSelection,
	RefObject,
} from '@react-types/shared';
import { filterDOMProps } from '../utils/filterDOMProps';
import type { KeyboardEvents } from '../interactions/useKeyboard';
import { menuData } from './utils';
import { mergeProps } from '../utils/mergeProps';
import type { TreeState } from '../stately/tree/useTreeState';
import { useSelectableList } from '../selection/useSelectableList';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface MenuProps<T> extends CollectionBase<T>, MultipleSelection {
	/** Where the focus should be set. */
	autoFocus?: boolean | FocusStrategy;
	/** Whether keyboard navigation is circular. */
	shouldFocusWrap?: boolean;
	/** Handler that is called when an item is selected. */
	onAction?: (key: Key, value: T) => void;
	/** Handler that is called when the menu should close after selecting an item. */
	onClose?: () => void;
}

export interface AriaMenuProps<T> extends MenuProps<T>, DOMProps, AriaLabelingProps {
	/**
	 * Whether pressing the escape key should clear selection in the menu or not.
	 *
	 * Most experiences should not modify this option as it eliminates a keyboard user's ability to
	 * easily clear selection. Only use if the escape key is being handled externally or should not
	 * trigger selection clearing contextually.
	 *
	 * @default 'clearSelection'
	 */
	escapeKeyBehavior?: 'clearSelection' | 'none';
}

export interface MenuAria {
	/** Props for the menu element. */
	menuProps: DOMAttributes;
}

export interface AriaMenuOptions<T> extends Omit<AriaMenuProps<T>, 'children'>, KeyboardEvents {
	/** Whether the menu uses virtual scrolling. */
	isVirtualized?: boolean;
	/**
	 * An optional keyboard delegate implementation for type to select,
	 * to override the default.
	 */
	keyboardDelegate?: KeyboardDelegate;
	/**
	 * Whether the menu items should use virtual focus instead of being focused directly.
	 */
	shouldUseVirtualFocus?: boolean;
}

/**
 * Provides the behavior and accessibility implementation for a menu component.
 * A menu displays a list of actions or options that a user can choose.
 *
 * @param props - Props for the menu.
 * @param state - State for the menu, as returned by `useListState`.
 */
export function useMenu<T>(
	props: AriaMenuOptions<T>,
	state: TreeState<T>,
	ref: RefObject<HTMLElement | null>,
): MenuAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useMenu<T>(
	props: AriaMenuOptions<T>,
	state: TreeState<T>,
	ref: RefObject<HTMLElement | null>,
	slot: symbol | undefined,
): MenuAria;
export function useMenu(...args: any[]): MenuAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useMenu');
	const props = user[0] as AriaMenuOptions<unknown>;
	const state = user[1] as TreeState<unknown>;
	const ref = user[2] as RefObject<HTMLElement | null>;

	let { shouldFocusWrap = true, onKeyDown, onKeyUp, ...otherProps } = props;

	let domProps = filterDOMProps(props, { labelable: true });
	let { listProps } = useSelectableList(
		{
			...otherProps,
			ref,
			selectionManager: state.selectionManager,
			collection: state.collection,
			disabledKeys: state.disabledKeys,
			shouldFocusWrap,
			linkBehavior: 'override',
		},
		subSlot(slot, 'list'),
	);

	menuData.set(state, {
		onClose: props.onClose,
		onAction: props.onAction,
		shouldUseVirtualFocus: props.shouldUseVirtualFocus,
	});

	return {
		menuProps: mergeProps(
			domProps,
			{ onKeyDown, onKeyUp },
			{
				role: 'menu',
				...listProps,
				onKeyDown: (e: KeyboardEvent) => {
					// don't clear the menu selected keys if the user is presses escape since escape closes the menu
					if (e.key !== 'Escape' || props.shouldUseVirtualFocus) {
						listProps.onKeyDown?.(e);
					}
				},
			},
		),
	};
}
