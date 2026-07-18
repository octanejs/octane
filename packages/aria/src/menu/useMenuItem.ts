// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/menu/useMenuItem.ts).
// octane adaptations:
// - Handlers receive NATIVE events (there is no synthetic layer): the `onClick` prop and
//   wrapper take the native MouseEvent (upstream: React.MouseEvent); the useKeyboard
//   handler receives the ported BaseEvent-wrapped native KeyboardEvent (which carries
//   `continuePropagation`).
// - `KeyboardEvents` / `FocusEvents` are the ported NATIVE-event versions; `PressEvents`'
//   `onClick` is re-declared natively (as in the ported useButton); `DOMAttributes` is a
//   local structural prop-bag alias.
// - `TreeState` / `SelectionManager` / `getItemCount` from the ported stately sources.
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention
//   (`useLinkProps` composes only context-reading hooks and takes no slot, matching the
//   ported useLink).
import type {
	DOMProps,
	FocusableElement,
	HoverEvents,
	Key,
	PressEvent,
	PressEvents,
	RefObject,
} from '@react-types/shared';
import { filterDOMProps } from '../utils/filterDOMProps';
import type { FocusEvents } from '../interactions/useFocus';
import { getEventTarget } from '../utils/shadowdom/DOMFunctions';
import { getItemCount } from '../stately/collections/getItemCount';
import { handleLinkClick, useLinkProps, useRouter } from '../utils/openLink';
import { isFocusVisible, setInteractionModality } from '../interactions/useFocusVisible';
import type { KeyboardEvents } from '../interactions/useKeyboard';
import { menuData } from './utils';
import { mergeProps } from '../utils/mergeProps';
import type { SelectionManager } from '../stately/selection/SelectionManager';
import type { TreeState } from '../stately/tree/useTreeState';
import { useFocusable } from '../interactions/useFocusable';
import { useHover } from '../interactions/useHover';
import { useKeyboard } from '../interactions/useKeyboard';
import { usePress } from '../interactions/usePress';
import { useRef } from 'octane';
import { useSelectableItem } from '../selection/useSelectableItem';
import { useSlotId } from '../utils/useId';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface MenuItemAria {
	/** Props for the menu item element. */
	menuItemProps: DOMAttributes;

	/** Props for the main text element inside the menu item. */
	labelProps: DOMAttributes;

	/** Props for the description text element inside the menu item, if any. */
	descriptionProps: DOMAttributes;

	/** Props for the keyboard shortcut text element inside the item, if any. */
	keyboardShortcutProps: DOMAttributes;

	/** Whether the item is currently focused. */
	isFocused: boolean;
	/** Whether the item is keyboard focused. */
	isFocusVisible: boolean;
	/** Whether the item is currently selected. */
	isSelected: boolean;
	/** Whether the item is currently in a pressed state. */
	isPressed: boolean;
	/** Whether the item is disabled. */
	isDisabled: boolean;
}

export interface AriaMenuItemProps
	extends DOMProps, Omit<PressEvents, 'onClick'>, HoverEvents, KeyboardEvents, FocusEvents {
	/**
	 * **Not recommended – use `onPress` instead.** octane adaptation: native MouseEvent
	 * (upstream's `PressEvents.onClick` is typed over React's synthetic event).
	 */
	onClick?: (e: MouseEvent) => void;

	/**
	 * Whether the menu item is disabled.
	 *
	 * @deprecated - pass disabledKeys to useTreeState instead.
	 */
	isDisabled?: boolean;

	/**
	 * Whether the menu item is selected.
	 *
	 * @deprecated - pass selectedKeys to useTreeState instead.
	 */
	isSelected?: boolean;

	/** A screen reader only label for the menu item. */
	'aria-label'?: string;

	/** The unique key for the menu item. */
	key: Key;

	/**
	 * Handler that is called when the menu should close after selecting an item.
	 *
	 * @deprecated - pass to the menu instead.
	 */
	onClose?: () => void;

	/**
	 * Whether the menu should close when the menu item is selected.
	 *
	 * @deprecated - use shouldCloseOnSelect instead.
	 */
	closeOnSelect?: boolean;

	/** Whether the menu should close when the menu item is selected. */
	shouldCloseOnSelect?: boolean;

	/** Whether the menu item is contained in a virtual scrolling menu. */
	isVirtualized?: boolean;

	/**
	 * Handler that is called when the user activates the item.
	 *
	 * @deprecated - pass to the menu instead.
	 */
	onAction?: (key: Key) => void;

	/** What kind of popup the item opens. */
	'aria-haspopup'?: 'menu' | 'dialog';

	/** Indicates whether the menu item's popup element is expanded or collapsed. */
	'aria-expanded'?: boolean | 'true' | 'false';

	/**
	 * Identifies the menu item's popup element whose contents or presence is controlled by the menu
	 * item.
	 */
	'aria-controls'?: string;

	/** Identifies the element(s) that describe the menu item. */
	'aria-describedby'?: string;

	/** Override of the selection manager. By default, `state.selectionManager` is used. */
	selectionManager?: SelectionManager;
}

/**
 * Provides the behavior and accessibility implementation for an item in a menu.
 * See `useMenu` for more details about menus.
 *
 * @param props - Props for the item.
 * @param state - State for the menu, as returned by `useTreeState`.
 */
export function useMenuItem<T>(
	props: AriaMenuItemProps,
	state: TreeState<T>,
	ref: RefObject<FocusableElement | null>,
): MenuItemAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useMenuItem<T>(
	props: AriaMenuItemProps,
	state: TreeState<T>,
	ref: RefObject<FocusableElement | null>,
	slot: symbol | undefined,
): MenuItemAria;
export function useMenuItem(...args: any[]): MenuItemAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useMenuItem');
	const props = user[0] as AriaMenuItemProps;
	const state = user[1] as TreeState<unknown>;
	const ref = user[2] as RefObject<FocusableElement | null>;

	let {
		id,
		key,
		closeOnSelect,
		shouldCloseOnSelect,
		isVirtualized,
		'aria-haspopup': hasPopup,
		onPressStart,
		onPressUp: pressUpProp,
		onPress,
		onPressChange: pressChangeProp,
		onPressEnd,
		onClick: onClickProp,
		onHoverStart: hoverStartProp,
		onHoverChange,
		onHoverEnd,
		onKeyDown,
		onKeyUp,
		onFocus,
		onFocusChange,
		onBlur,
		selectionManager = state.selectionManager,
	} = props;

	let isTrigger = !!hasPopup;
	let isTriggerExpanded = isTrigger && props['aria-expanded'] === 'true';
	let isDisabled = props.isDisabled ?? selectionManager.isDisabled(key);
	let isSelected = props.isSelected ?? selectionManager.isSelected(key);
	let data = menuData.get(state)!;
	let item = state.collection.getItem(key);
	let onClose = props.onClose || data.onClose;
	let router = useRouter();
	let performAction = () => {
		if (isTrigger) {
			return;
		}

		if (item?.props?.onAction) {
			item.props.onAction();
		} else if (props.onAction) {
			props.onAction(key);
		}

		if (data.onAction) {
			// Must reassign to variable otherwise `this` binding gets messed up. Something to do with WeakMap.
			let onAction = data.onAction;
			onAction(key, item?.value);
		}
	};

	let role = 'menuitem';
	if (!isTrigger) {
		if (selectionManager.selectionMode === 'single') {
			role = 'menuitemradio';
		} else if (selectionManager.selectionMode === 'multiple') {
			role = 'menuitemcheckbox';
		}
	}

	let labelId = useSlotId(undefined, subSlot(slot, 'labelId'));
	let descriptionId = useSlotId(undefined, subSlot(slot, 'descriptionId'));
	let keyboardId = useSlotId(undefined, subSlot(slot, 'keyboardId'));

	let ariaProps: DOMAttributes = {
		id,
		'aria-disabled': isDisabled || undefined,
		role,
		'aria-label': props['aria-label'],
		'aria-labelledby': labelId,
		'aria-describedby':
			[props['aria-describedby'], descriptionId, keyboardId].filter(Boolean).join(' ') || undefined,
		'aria-controls': props['aria-controls'],
		'aria-haspopup': hasPopup,
		'aria-expanded': props['aria-expanded'],
	};

	if (selectionManager.selectionMode !== 'none' && !isTrigger) {
		ariaProps['aria-checked'] = isSelected;
	}

	if (isVirtualized) {
		let index = Number(item?.index);
		ariaProps['aria-posinset'] = Number.isNaN(index) ? undefined : index + 1;
		ariaProps['aria-setsize'] = getItemCount(state.collection);
	}

	let isPressedRef = useRef(false, subSlot(slot, 'isPressedRef'));
	let onPressChange = (isPressed: boolean) => {
		pressChangeProp?.(isPressed);
		isPressedRef.current = isPressed;
	};

	let interaction = useRef<{ pointerType: string; key?: string } | null>(
		null,
		subSlot(slot, 'interaction'),
	);
	let onPressUp = (e: PressEvent) => {
		if (e.pointerType !== 'keyboard') {
			interaction.current = { pointerType: e.pointerType };
		}

		// If interacting with mouse, allow the user to mouse down on the trigger button,
		// drag, and release over an item (matching native behavior).
		if (e.pointerType === 'mouse') {
			if (!isPressedRef.current) {
				(e.target as HTMLElement).click();
			}
		}

		pressUpProp?.(e);
	};

	let onClick = (e: MouseEvent) => {
		onClickProp?.(e);
		performAction();
		handleLinkClick(e, router, item!.props.href, item?.props.routerOptions);

		let shouldClose =
			interaction.current?.pointerType === 'keyboard'
				? // Always close when pressing Enter key, or if item is not selectable.
					interaction.current?.key === 'Enter' ||
					selectionManager.selectionMode === 'none' ||
					selectionManager.isLink(key)
				: // Close except if multi-select is enabled.
					selectionManager.selectionMode !== 'multiple' || selectionManager.isLink(key);

		shouldClose = shouldCloseOnSelect ?? closeOnSelect ?? shouldClose;

		if (onClose && !isTrigger && shouldClose) {
			onClose();
		}

		interaction.current = null;
	};

	let { itemProps, isFocused } = useSelectableItem(
		{
			id,
			selectionManager: selectionManager,
			key,
			ref,
			shouldSelectOnPressUp: true,
			allowsDifferentPressOrigin: true,
			// Disable all handling of links in useSelectable item
			// because we handle it ourselves. The behavior of menus
			// is slightly different from other collections because
			// actions are performed on key down rather than key up.
			linkBehavior: 'none',
			shouldUseVirtualFocus: data.shouldUseVirtualFocus,
		},
		subSlot(slot, 'item'),
	);

	let { pressProps, isPressed } = usePress(
		{
			onPressStart,
			onPress,
			onPressUp,
			onPressChange,
			onPressEnd,
			isDisabled,
		},
		subSlot(slot, 'press'),
	);
	let { hoverProps } = useHover(
		{
			isDisabled,
			onHoverStart(e) {
				// Hovering over an already expanded sub dialog trigger should keep focus in the dialog.
				if (!isFocusVisible() && !(isTriggerExpanded && hasPopup)) {
					selectionManager.setFocused(true);
					selectionManager.setFocusedKey(key);
				}
				hoverStartProp?.(e);
			},
			onHoverChange,
			onHoverEnd,
		},
		subSlot(slot, 'hover'),
	);

	let { keyboardProps } = useKeyboard(
		{
			onKeyDown: (e) => {
				// Ignore repeating events, which may have started on the menu trigger before moving
				// focus to the menu item. We want to wait for a second complete key press sequence.
				if (e.repeat) {
					e.continuePropagation();
					return;
				}

				switch (e.key) {
					case ' ':
						interaction.current = { pointerType: 'keyboard', key: ' ' };
						(getEventTarget(e) as HTMLElement).click();

						// click above sets modality to "virtual", need to set interaction modality back to 'keyboard' so focusSafely calls properly move focus
						// to the newly opened submenu's first item.
						setInteractionModality('keyboard');
						break;
					case 'Enter':
						interaction.current = { pointerType: 'keyboard', key: 'Enter' };

						// Trigger click unless this is a link. Links trigger click natively.
						if ((getEventTarget(e) as HTMLElement).tagName !== 'A') {
							(getEventTarget(e) as HTMLElement).click();
						}

						// click above sets modality to "virtual", need to set interaction modality back to 'keyboard' so focusSafely calls properly move focus
						// to the newly opened submenu's first item.
						setInteractionModality('keyboard');
						break;
					default:
						if (!isTrigger) {
							e.continuePropagation();
						}

						onKeyDown?.(e);
						break;
				}
			},
			onKeyUp,
		},
		subSlot(slot, 'keyboard'),
	);

	let { focusableProps } = useFocusable(
		{ onBlur, onFocus, onFocusChange },
		ref,
		subSlot(slot, 'focusable'),
	);
	let domProps = filterDOMProps(item?.props);
	delete domProps.id;
	let linkProps = useLinkProps(item?.props);

	return {
		menuItemProps: {
			...ariaProps,
			...mergeProps(
				domProps,
				linkProps,
				isTrigger
					? {
							onFocus: itemProps.onFocus,
							'data-collection': itemProps['data-collection'],
							'data-key': itemProps['data-key'],
						}
					: itemProps,
				pressProps,
				hoverProps,
				keyboardProps,
				focusableProps,
				// Prevent DOM focus from moving on mouse down when using virtual focus or this is a submenu/subdialog trigger.
				data.shouldUseVirtualFocus || isTrigger
					? { onMouseDown: (e: MouseEvent) => e.preventDefault() }
					: undefined,
				isDisabled ? undefined : { onClick },
			),
			// If a submenu is expanded, set the tabIndex to -1 so that shift tabbing goes out of the menu instead of the parent menu item.
			tabIndex:
				itemProps.tabIndex != null && isTriggerExpanded && !data.shouldUseVirtualFocus
					? -1
					: itemProps.tabIndex,
		},
		labelProps: {
			id: labelId,
		},
		descriptionProps: {
			id: descriptionId,
		},
		keyboardShortcutProps: {
			id: keyboardId,
		},
		isFocused,
		isFocusVisible:
			isFocused && selectionManager.isFocused && isFocusVisible() && !isTriggerExpanded,
		isSelected,
		isPressed,
		isDisabled,
	};
}
