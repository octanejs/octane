// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/menu/useMenuTrigger.ts).
// octane adaptations:
// - `useOverlayTrigger` comes from the freshly-ported overlays glue
//   (src/overlays/useOverlayTrigger.ts) — the rest of the overlays area (positioning,
//   modal machinery) remains unported.
// - The trigger `onKeyDown` receives either the NATIVE KeyboardEvent (when spread straight
//   onto an element) or the ported BaseEvent Proxy wrapper (when routed through
//   useButton/useKeyboard). Upstream detects the wrapper with `'continuePropagation' in e`;
//   the ported wrapper is a Proxy with only a `get` trap, so detection uses
//   `typeof e.continuePropagation === 'function'` (the same probe createEventHandler uses
//   for nested wrappers). Upstream's synthetic `e.isDefaultPrevented()` becomes the native
//   `e.defaultPrevented`.
// - The Parcel glob intl import becomes the generated '../intl/menu' dictionary index.
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention.
import type { AriaButtonProps } from '../button/useButton';
import type { AriaMenuOptions } from './useMenu';
import type { FocusableElement, RefObject } from '@react-types/shared';
import { focusWithoutScrolling } from '../utils/focusWithoutScrolling';
import intlMessages from '../intl/menu';
import type { MenuTriggerState, MenuTriggerType } from '../stately/menu/useMenuTriggerState';
import type { PressProps } from '../interactions/usePress';
import { useId } from '../utils/useId';
import { useLocalizedStringFormatter } from '../i18n/useLocalizedStringFormatter';
import { useLongPress } from '../interactions/useLongPress';
import { useOverlayTrigger } from '../overlays/useOverlayTrigger';

import { S, splitSlot, subSlot } from '../internal';

export interface AriaMenuTriggerProps {
	/** The type of menu that the menu trigger opens. */
	type?: 'menu' | 'listbox';
	/** Whether menu trigger is disabled. */
	isDisabled?: boolean;
	/** How menu is triggered. */
	trigger?: MenuTriggerType;
}

export interface MenuTriggerAria<T> {
	/** Props for the menu trigger element. */
	menuTriggerProps: AriaButtonProps;

	/** Props for the menu. */
	menuProps: AriaMenuOptions<T>;
}

/**
 * Provides the behavior and accessibility implementation for a menu trigger.
 *
 * @param props - Props for the menu trigger.
 * @param state - State for the menu trigger.
 * @param ref - Ref to the HTML element trigger for the menu.
 */
export function useMenuTrigger<T>(
	props: AriaMenuTriggerProps,
	state: MenuTriggerState,
	ref: RefObject<Element | null>,
): MenuTriggerAria<T>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useMenuTrigger<T>(
	props: AriaMenuTriggerProps,
	state: MenuTriggerState,
	ref: RefObject<Element | null>,
	slot: symbol | undefined,
): MenuTriggerAria<T>;
export function useMenuTrigger(...args: any[]): MenuTriggerAria<any> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useMenuTrigger');
	const props = user[0] as AriaMenuTriggerProps;
	const state = user[1] as MenuTriggerState;
	const ref = user[2] as RefObject<Element | null>;

	let { type = 'menu', isDisabled, trigger = 'press' } = props;

	let menuTriggerId = useId(subSlot(slot, 'triggerId'));
	let { triggerProps, overlayProps } = useOverlayTrigger(
		{ type },
		state,
		ref,
		subSlot(slot, 'overlayTrigger'),
	);

	let onKeyDown = (e: any) => {
		if (isDisabled) {
			return;
		}

		if (trigger === 'longPress' && !e.altKey) {
			return;
		}

		if (ref && ref.current) {
			switch (e.key) {
				case 'Enter':
				case ' ':
					// React puts listeners on the same root, so even if propagation was stopped, immediate propagation is still possible.
					// useTypeSelect will handle the spacebar first if it's running, so we don't want to open if it's handled it already.
					// We use isDefaultPrevented() instead of isPropagationStopped() because createEventHandler stops propagation by default.
					// And default prevented means that the event was handled by something else (typeahead), so we don't want to open the menu.
					// octane adaptation: the native `defaultPrevented` flag (forwarded by the
					// BaseEvent Proxy wrapper) replaces the synthetic isDefaultPrevented().
					if (trigger === 'longPress' || e.defaultPrevented) {
						return;
					}
				// fallthrough
				case 'ArrowDown':
					// Stop propagation, unless it would already be handled by useKeyboard.
					if (typeof e.continuePropagation !== 'function') {
						e.stopPropagation();
					}
					e.preventDefault();
					state.toggle('first');
					break;
				case 'ArrowUp':
					if (typeof e.continuePropagation !== 'function') {
						e.stopPropagation();
					}
					e.preventDefault();
					state.toggle('last');
					break;
				default:
					// Allow other keys.
					if (typeof e.continuePropagation === 'function') {
						e.continuePropagation();
					}
			}
		}
	};

	let stringFormatter = useLocalizedStringFormatter(
		intlMessages,
		'@react-aria/menu',
		subSlot(slot, 'formatter'),
	);
	let { longPressProps } = useLongPress(
		{
			isDisabled: isDisabled || trigger !== 'longPress',
			accessibilityDescription: stringFormatter.format('longPressMessage'),
			onLongPressStart() {
				state.close();
			},
			onLongPress() {
				state.open('first');
			},
		},
		subSlot(slot, 'longPress'),
	);

	let pressProps: PressProps = {
		preventFocusOnPress: true,
		onPressStart(e) {
			// For consistency with native, open the menu on mouse/key down, but touch up.
			if (e.pointerType !== 'touch' && e.pointerType !== 'keyboard' && !isDisabled) {
				// Ensure trigger has focus before opening the menu so it can be restored by FocusScope on close.
				focusWithoutScrolling(e.target as FocusableElement);

				// If opened with a screen reader, auto focus the first item.
				// Otherwise, the menu itself will be focused.
				state.open(e.pointerType === 'virtual' ? 'first' : null);
			}
		},
		onPress(e) {
			if (e.pointerType === 'touch' && !isDisabled) {
				// Ensure trigger has focus before opening the menu so it can be restored by FocusScope on close.
				focusWithoutScrolling(e.target as FocusableElement);

				state.toggle();
			}
		},
	};

	// omit onPress from triggerProps since we override it above.
	delete triggerProps.onPress;

	return {
		// @ts-ignore - TODO we pass out both DOMAttributes AND AriaButtonProps, but useButton will discard the longPress event handlers, it's only through PressResponder magic that this works for RSP and RAC. it does not work in aria examples
		menuTriggerProps: {
			...triggerProps,
			...(trigger === 'press' ? pressProps : longPressProps),
			id: menuTriggerId,
			onKeyDown,
		},
		menuProps: {
			...overlayProps,
			'aria-labelledby': menuTriggerId,
			autoFocus: state.focusStrategy || true,
			onClose: state.close,
		},
	};
}
