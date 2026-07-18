// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/menu/useSubmenuTrigger.ts).
// octane adaptations:
// - Handlers receive NATIVE events: `submenuKeyDown` gets the native KeyboardEvent through
//   the menu's merged onKeyDown chain; `submenuTriggerKeyDown` gets the ported
//   BaseEvent-wrapped KeyboardEvent (it flows through useMenuItem's useKeyboard, which
//   supplies `continuePropagation`).
// - The popover container types (`AriaPopoverProps` from overlays/usePopover and
//   `OverlayProps` from overlays/Overlay) are NOT yet ported (overlay positioning/modal
//   machinery is out of scope); `SubmenuTriggerAria.popoverProps` is a local structural
//   equivalent of upstream's picked fields.
// - `SubmenuTriggerState` type from the ported stately menu state.
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention; explicit
//   dependency arrays are kept verbatim.
import type { AriaMenuItemProps } from './useMenuItem';
import type { AriaMenuOptions } from './useMenu';
import type { BaseEvent } from '../interactions/createEventHandler';
import type { FocusableElement, FocusStrategy, RefObject } from '@react-types/shared';
import { focusWithoutScrolling } from '../utils/focusWithoutScrolling';
import {
	getActiveElement,
	getEventTarget,
	isFocusWithin,
	nodeContains,
} from '../utils/shadowdom/DOMFunctions';
import type { PressEvent } from '@react-types/shared';
import type { SubmenuTriggerState } from '../stately/menu/useSubmenuTriggerState';
import { useCallback, useRef } from 'octane';
import { useEvent } from '../utils/useEvent';
import { useId } from '../utils/useId';
import { useLayoutEffect } from '../utils/useLayoutEffect';
import { useLocale } from '../i18n/I18nProvider';
import { useSafelyMouseToSubmenu } from './useSafelyMouseToSubmenu';

import { S, splitSlot, subSlot } from '../internal';

export interface AriaSubmenuTriggerProps {
	/**
	 * An object representing the submenu trigger menu item. Contains all the relevant information
	 * that makes up the menu item.
	 *
	 * @deprecated
	 */
	node?: any;
	/** Whether the submenu trigger is disabled. */
	isDisabled?: boolean;
	/** The type of the contents that the submenu trigger opens. */
	type?: 'dialog' | 'menu';
	/** Ref of the menu that contains the submenu trigger. */
	parentMenuRef: RefObject<HTMLElement | null>;
	/** Ref of the submenu opened by the submenu trigger. */
	submenuRef: RefObject<HTMLElement | null>;
	/**
	 * The delay time in milliseconds for the submenu to appear after hovering over the trigger.
	 *
	 * @default 200
	 */
	delay?: number;
	/** Whether the submenu trigger uses virtual focus. */
	shouldUseVirtualFocus?: boolean;
}

interface SubmenuTriggerProps extends Omit<AriaMenuItemProps, 'key' | 'onAction'> {
	/** Whether the submenu trigger is in an expanded state. */
	isOpen: boolean;
}

interface SubmenuProps<T> extends AriaMenuOptions<T> {
	/** The level of the submenu. */
	submenuLevel: number;
}

export interface SubmenuTriggerAria<T> {
	/** Props for the submenu trigger menu item. */
	submenuTriggerProps: SubmenuTriggerProps;
	/** Props for the submenu controlled by the submenu trigger menu item. */
	submenuProps: SubmenuProps<T>;
	/**
	 * Props for the submenu's popover container.
	 *
	 * octane adaptation: a structural equivalent of upstream's
	 * `Pick<AriaPopoverProps, 'isNonModal' | 'shouldCloseOnInteractOutside'> &
	 * Pick<OverlayProps, 'disableFocusManagement'>` (the overlays area is not yet ported).
	 */
	popoverProps: {
		isNonModal?: boolean;
		shouldCloseOnInteractOutside?: (element: Element) => boolean;
		disableFocusManagement?: boolean;
	};
}

/**
 * Provides the behavior and accessibility implementation for a submenu trigger and its associated
 * submenu.
 *
 * @param props - Props for the submenu trigger and refs attach to its submenu and parent menu.
 * @param state - State for the submenu trigger.
 * @param ref - Ref to the submenu trigger element.
 */
export function useSubmenuTrigger<T>(
	props: AriaSubmenuTriggerProps,
	state: SubmenuTriggerState,
	ref: RefObject<FocusableElement | null>,
): SubmenuTriggerAria<T>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useSubmenuTrigger<T>(
	props: AriaSubmenuTriggerProps,
	state: SubmenuTriggerState,
	ref: RefObject<FocusableElement | null>,
	slot: symbol | undefined,
): SubmenuTriggerAria<T>;
export function useSubmenuTrigger(...args: any[]): SubmenuTriggerAria<any> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useSubmenuTrigger');
	const props = user[0] as AriaSubmenuTriggerProps;
	const state = user[1] as SubmenuTriggerState;
	const ref = user[2] as RefObject<FocusableElement | null>;

	let {
		parentMenuRef,
		submenuRef,
		type = 'menu',
		isDisabled,
		delay = 200,
		shouldUseVirtualFocus,
	} = props;
	let submenuTriggerId = useId(subSlot(slot, 'triggerId'));
	let overlayId = useId(subSlot(slot, 'overlayId'));
	let { direction } = useLocale(subSlot(slot, 'locale'));
	let openTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
		subSlot(slot, 'openTimeout'),
	);
	let cancelOpenTimeout = useCallback(
		() => {
			if (openTimeout.current) {
				clearTimeout(openTimeout.current);
				openTimeout.current = undefined;
			}
		},
		[openTimeout],
		subSlot(slot, 'cancelOpen'),
	);

	let onSubmenuOpen = useCallback(
		(focusStrategy?: FocusStrategy) => {
			cancelOpenTimeout();
			state.open(focusStrategy);
		},
		[state, cancelOpenTimeout],
		subSlot(slot, 'open'),
	);

	let onSubmenuClose = useCallback(
		() => {
			cancelOpenTimeout();
			state.close();
		},
		[state, cancelOpenTimeout],
		subSlot(slot, 'close'),
	);

	useLayoutEffect(
		() => {
			return () => {
				cancelOpenTimeout();
			};
		},
		[cancelOpenTimeout],
		subSlot(slot, 'teardown'),
	);

	let submenuKeyDown = (e: KeyboardEvent) => {
		// If focus is not within the menu, assume virtual focus is being used.
		// This means some other input element is also within the popover, so we shouldn't close the menu.
		if (!isFocusWithin(e.currentTarget as Element)) {
			return;
		}

		switch (e.key) {
			case 'ArrowLeft':
				if (
					direction === 'ltr' &&
					nodeContains(e.currentTarget as Element, getEventTarget(e) as Element)
				) {
					e.preventDefault();
					e.stopPropagation();
					onSubmenuClose();
					if (!shouldUseVirtualFocus && ref.current) {
						focusWithoutScrolling(ref.current);
					}
				}
				break;
			case 'ArrowRight':
				if (
					direction === 'rtl' &&
					nodeContains(e.currentTarget as Element, getEventTarget(e) as Element)
				) {
					e.preventDefault();
					e.stopPropagation();
					onSubmenuClose();
					if (!shouldUseVirtualFocus && ref.current) {
						focusWithoutScrolling(ref.current);
					}
				}
				break;
			case 'Escape':
				// TODO: can remove this when we fix collection event leaks
				if (nodeContains(submenuRef.current, getEventTarget(e) as Element)) {
					e.stopPropagation();
					onSubmenuClose();
					if (!shouldUseVirtualFocus && ref.current) {
						focusWithoutScrolling(ref.current);
					}
				}
				break;
		}
	};

	let submenuProps = {
		id: overlayId,
		'aria-labelledby': submenuTriggerId,
		submenuLevel: state.submenuLevel,
		...(type === 'menu' && {
			onClose: state.closeAll,
			autoFocus: state.focusStrategy ?? undefined,
			onKeyDown: submenuKeyDown,
		}),
	};

	let submenuTriggerKeyDown = (e: BaseEvent<KeyboardEvent>) => {
		switch (e.key) {
			case 'ArrowRight':
				if (!isDisabled) {
					if (direction === 'ltr') {
						e.preventDefault();
						if (!state.isOpen) {
							onSubmenuOpen('first');
						}

						if (type === 'menu' && !!submenuRef?.current && getActiveElement() === ref?.current) {
							focusWithoutScrolling(submenuRef.current);
						}
					} else if (state.isOpen) {
						onSubmenuClose();
					} else {
						e.continuePropagation();
					}
				}

				break;
			case 'ArrowLeft':
				if (!isDisabled) {
					if (direction === 'rtl') {
						e.preventDefault();
						if (!state.isOpen) {
							onSubmenuOpen('first');
						}

						if (type === 'menu' && !!submenuRef?.current && getActiveElement() === ref?.current) {
							focusWithoutScrolling(submenuRef.current);
						}
					} else if (state.isOpen) {
						onSubmenuClose();
					} else {
						e.continuePropagation();
					}
				}
				break;
			default:
				e.continuePropagation();
				break;
		}
	};

	let onPressStart = (e: PressEvent) => {
		if (!isDisabled && (e.pointerType === 'virtual' || e.pointerType === 'keyboard')) {
			// If opened with a screen reader or keyboard, auto focus the first submenu item.
			onSubmenuOpen('first');
		}
	};

	let onPress = (e: PressEvent) => {
		if (!isDisabled && (e.pointerType === 'touch' || e.pointerType === 'mouse')) {
			// For touch or on a desktop device with a small screen open on press up to possible problems with
			// press up happening on the newly opened tray items
			onSubmenuOpen();
		}
	};

	let onHoverChange = (isHovered: boolean) => {
		if (!isDisabled) {
			if (isHovered && !state.isOpen) {
				if (!openTimeout.current) {
					openTimeout.current = setTimeout(() => {
						onSubmenuOpen();
					}, delay);
				}
			} else if (!isHovered) {
				cancelOpenTimeout();
			}
		}
	};

	useEvent(
		parentMenuRef,
		'focusin',
		(e) => {
			// If we detect focus moved to a different item in the same menu that the currently open submenu trigger is in
			// then close the submenu. This is for a case where the user hovers a root menu item when multiple submenus are open
			if (
				state.isOpen &&
				nodeContains(parentMenuRef.current, getEventTarget(e) as HTMLElement) &&
				getEventTarget(e) !== ref.current
			) {
				onSubmenuClose();
			}
		},
		subSlot(slot, 'focusin'),
	);

	let shouldCloseOnInteractOutside = (target: Element) => {
		if (target !== ref.current) {
			return true;
		}

		return false;
	};

	useSafelyMouseToSubmenu(
		{
			menuRef: parentMenuRef,
			submenuRef,
			isOpen: state.isOpen,
			isDisabled: isDisabled,
		},
		subSlot(slot, 'safeMouse'),
	);

	return {
		submenuTriggerProps: {
			id: submenuTriggerId,
			'aria-controls': state.isOpen ? overlayId : undefined,
			'aria-haspopup': !isDisabled ? type : undefined,
			'aria-expanded': state.isOpen ? 'true' : 'false',
			onPressStart,
			onPress,
			onHoverChange,
			onKeyDown: submenuTriggerKeyDown,
			isOpen: state.isOpen,
		},
		submenuProps,
		popoverProps: {
			isNonModal: true,
			shouldCloseOnInteractOutside,
		},
	};
}
