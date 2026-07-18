// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/overlays/useOverlay.ts).
// octane adaptations: `DOMAttributes` is a local structural prop-bag alias (upstream's is typed
// over React's synthetic handlers); handlers receive NATIVE DOM events (no synthetic layer), so
// `e.nativeEvent.isComposing` → `e.isComposing`; public-hook slot threading (splitSlot/subSlot)
// per the binding convention; the explicit `[isOpen, ref]` dependency array is kept verbatim.
import type { RefObject } from '@react-types/shared';
import { getEventTarget } from '../utils/shadowdom/DOMFunctions';
import { isElementInChildOfActiveScope } from '../focus/FocusScope';
import { useEffect, useRef } from 'octane';
import { useFocusWithin } from '../interactions/useFocusWithin';
import { useInteractOutside } from '../interactions/useInteractOutside';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface AriaOverlayProps {
	/** Whether the overlay is currently open. */
	isOpen?: boolean;

	/** Handler that is called when the overlay should close. */
	onClose?: () => void;

	/**
	 * Whether to close the overlay when the user interacts outside it.
	 *
	 * @default false
	 */
	isDismissable?: boolean;

	/** Whether the overlay should close when focus is lost or moves outside it. */
	shouldCloseOnBlur?: boolean;

	/**
	 * Whether pressing the escape key to close the overlay should be disabled.
	 *
	 * @default false
	 */
	isKeyboardDismissDisabled?: boolean;

	/**
	 * When user interacts with the argument element outside of the overlay ref,
	 * return true if onClose should be called.  This gives you a chance to filter
	 * out interaction with elements that should not dismiss the overlay.
	 * By default, onClose will always be called on interaction outside the overlay ref.
	 */
	shouldCloseOnInteractOutside?: (element: Element) => boolean;
}

export interface OverlayAria {
	/** Props to apply to the overlay container element. */
	overlayProps: DOMAttributes;
	/** Props to apply to the underlay element, if any. */
	underlayProps: DOMAttributes;
}

const visibleOverlays: RefObject<Element | null>[] = [];

/**
 * Provides the behavior for overlays such as dialogs, popovers, and menus.
 * Hides the overlay when the user interacts outside it, when the Escape key is pressed,
 * or optionally, on blur. Only the top-most overlay will close at once.
 */
export function useOverlay(props: AriaOverlayProps, ref: RefObject<Element | null>): OverlayAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useOverlay(
	props: AriaOverlayProps,
	ref: RefObject<Element | null>,
	slot: symbol | undefined,
): OverlayAria;
export function useOverlay(...args: any[]): OverlayAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useOverlay');
	const props = user[0] as AriaOverlayProps;
	const ref = user[1] as RefObject<Element | null>;

	let {
		onClose,
		shouldCloseOnBlur,
		isOpen,
		isDismissable = false,
		isKeyboardDismissDisabled = false,
		shouldCloseOnInteractOutside,
	} = props;

	let lastVisibleOverlay = useRef<RefObject<Element | null> | undefined>(
		undefined,
		subSlot(slot, 'lastVisible'),
	);

	// Add the overlay ref to the stack of visible overlays on mount, and remove on unmount.
	useEffect(
		() => {
			if (isOpen && !visibleOverlays.includes(ref)) {
				visibleOverlays.push(ref);
				return () => {
					let index = visibleOverlays.indexOf(ref);
					if (index >= 0) {
						visibleOverlays.splice(index, 1);
					}
				};
			}
		},
		[isOpen, ref],
		subSlot(slot, 'stack'),
	);

	// Only hide the overlay when it is the topmost visible overlay in the stack
	let onHide = () => {
		if (visibleOverlays[visibleOverlays.length - 1] === ref && onClose) {
			onClose();
		}
	};

	let onInteractOutsideStart = (e: PointerEvent) => {
		const topMostOverlay = visibleOverlays[visibleOverlays.length - 1];
		lastVisibleOverlay.current = topMostOverlay;
		if (
			!shouldCloseOnInteractOutside ||
			shouldCloseOnInteractOutside(getEventTarget(e) as Element)
		) {
			if (topMostOverlay === ref) {
				e.stopPropagation();
			}
		}
	};

	let onInteractOutside = (e: PointerEvent) => {
		if (
			!shouldCloseOnInteractOutside ||
			shouldCloseOnInteractOutside(getEventTarget(e) as Element)
		) {
			if (visibleOverlays[visibleOverlays.length - 1] === ref) {
				e.stopPropagation();
			}
			if (lastVisibleOverlay.current === ref) {
				onHide();
			}
		}
		lastVisibleOverlay.current = undefined;
	};

	// Handle the escape key
	let onKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Escape' && !isKeyboardDismissDisabled && !e.isComposing) {
			e.stopPropagation();
			e.preventDefault();
			onHide();
		}
	};

	// Handle clicking outside the overlay to close it
	useInteractOutside(
		{
			ref,
			onInteractOutside: isDismissable && isOpen ? onInteractOutside : undefined,
			onInteractOutsideStart,
		},
		subSlot(slot, 'interactOutside'),
	);

	let { focusWithinProps } = useFocusWithin(
		{
			isDisabled: !shouldCloseOnBlur,
			onBlurWithin: (e) => {
				// Do not close if relatedTarget is null, which means focus is lost to the body.
				// That can happen when switching tabs, or due to a VoiceOver/Chrome bug with Control+Option+Arrow navigation.
				// Clicking on the body to close the overlay should already be handled by useInteractOutside.
				// https://github.com/adobe/react-spectrum/issues/4130
				// https://github.com/adobe/react-spectrum/issues/4922
				//
				// If focus is moving into a child focus scope (e.g. menu inside a dialog),
				// do not close the outer overlay. At this point, the active scope should
				// still be the outer overlay, since blur events run before focus.
				if (!e.relatedTarget || isElementInChildOfActiveScope(e.relatedTarget as Element)) {
					return;
				}

				if (
					!shouldCloseOnInteractOutside ||
					shouldCloseOnInteractOutside(e.relatedTarget as Element)
				) {
					onClose?.();
				}
			},
		},
		subSlot(slot, 'focusWithin'),
	);

	return {
		overlayProps: {
			onKeyDown,
			...focusWithinProps,
		},
		underlayProps: {},
	};
}
