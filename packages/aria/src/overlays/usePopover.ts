// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/overlays/usePopover.ts).
// octane adaptations: `DOMAttributes` is a local structural prop-bag alias; public-hook slot
// threading (splitSlot/subSlot) per the binding convention — the composed ported hooks
// (useOverlay/useOverlayPosition/usePreventScroll) each receive a derived sub-slot; the explicit
// dependency array is kept verbatim; `OverlayTriggerState` from the ported stately overlays state;
// element types → `any`.
import { ariaHideOutside, keepVisible } from './ariaHideOutside';
import { AriaPositionProps, PlacementAxis, useOverlayPosition } from './useOverlayPosition';
import type { RefObject } from '@react-types/shared';
import { mergeProps } from '../utils/mergeProps';
import type { OverlayTriggerState } from '../stately/overlays/useOverlayTriggerState';
import { useEffect } from 'octane';
import { useOverlay } from './useOverlay';
import { usePreventScroll } from './usePreventScroll';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface AriaPopoverProps extends Omit<
	AriaPositionProps,
	'isOpen' | 'onClose' | 'targetRef' | 'overlayRef'
> {
	/**
	 * The ref for the element which the popover positions itself with respect to.
	 */
	triggerRef: RefObject<Element | null>;
	/**
	 * The ref for the popover element.
	 */
	popoverRef: RefObject<Element | null>;
	/** A ref for the popover arrow element. */
	arrowRef?: RefObject<Element | null>;
	/**
	 * An optional ref for a group of popovers, e.g. submenus.
	 * When provided, this element is used to detect outside interactions
	 * and hiding elements from assistive technologies instead of the popoverRef.
	 */
	groupRef?: RefObject<Element | null>;
	/**
	 * Whether the popover is non-modal, i.e. elements outside the popover may be
	 * interacted with by assistive technologies.
	 *
	 * Most popovers should not use this option as it may negatively impact the screen
	 * reader experience. Only use with components such as combobox, which are designed
	 * to handle this situation carefully.
	 */
	isNonModal?: boolean;
	/**
	 * Whether pressing the escape key to close the popover should be disabled.
	 *
	 * Most popovers should not use this option. When set to true, an alternative
	 * way to close the popover with a keyboard must be provided.
	 *
	 * @default false
	 */
	isKeyboardDismissDisabled?: boolean;
	/**
	 * When user interacts with the argument element outside of the popover ref,
	 * return true if onClose should be called. This gives you a chance to filter
	 * out interaction with elements that should not dismiss the popover.
	 * By default, onClose will always be called on interaction outside the popover ref.
	 */
	shouldCloseOnInteractOutside?: (element: Element) => boolean;
}

export interface PopoverAria {
	/** Props for the popover element. */
	popoverProps: DOMAttributes;
	/** Props for the popover tip arrow if any. */
	arrowProps: DOMAttributes;
	/** Props to apply to the underlay element, if any. */
	underlayProps: DOMAttributes;
	/** Placement of the popover with respect to the trigger. */
	placement: PlacementAxis | null;
	/** The origin of the target in the overlay's coordinate system. Useful for animations. */
	triggerAnchorPoint: { x: number; y: number } | null;
}

/**
 * Provides the behavior and accessibility implementation for a popover component.
 * A popover is an overlay element positioned relative to a trigger.
 */
export function usePopover(props: AriaPopoverProps, state: OverlayTriggerState): PopoverAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function usePopover(
	props: AriaPopoverProps,
	state: OverlayTriggerState,
	slot: symbol | undefined,
): PopoverAria;
export function usePopover(...args: any[]): PopoverAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('usePopover');
	const props = user[0] as AriaPopoverProps;
	const state = user[1] as OverlayTriggerState;

	let {
		triggerRef,
		popoverRef,
		groupRef,
		isNonModal,
		isKeyboardDismissDisabled,
		shouldCloseOnInteractOutside,
		...otherProps
	} = props;

	let isSubmenu = (otherProps as any)['trigger'] === 'SubmenuTrigger';

	let { overlayProps, underlayProps } = useOverlay(
		{
			isOpen: state.isOpen,
			onClose: state.close,
			shouldCloseOnBlur: true,
			isDismissable: !isNonModal || isSubmenu,
			isKeyboardDismissDisabled,
			shouldCloseOnInteractOutside,
		},
		groupRef ?? popoverRef,
		subSlot(slot, 'overlay'),
	);

	let {
		overlayProps: positionProps,
		arrowProps,
		placement,
		triggerAnchorPoint: origin,
	} = useOverlayPosition(
		{
			...otherProps,
			targetRef: triggerRef,
			overlayRef: popoverRef,
			isOpen: state.isOpen,
			onClose: isNonModal && !isSubmenu ? state.close : null,
		},
		subSlot(slot, 'position'),
	);

	usePreventScroll(
		{
			isDisabled: isNonModal || !state.isOpen,
		},
		subSlot(slot, 'preventScroll'),
	);

	useEffect(
		() => {
			if (state.isOpen && popoverRef.current) {
				if (isNonModal) {
					return keepVisible(groupRef?.current ?? popoverRef.current);
				} else {
					return ariaHideOutside([groupRef?.current ?? popoverRef.current], {
						shouldUseInert: true,
					});
				}
			}
		},
		[isNonModal, state.isOpen, popoverRef, groupRef],
		subSlot(slot, 'hideOutside'),
	);

	return {
		popoverProps: mergeProps(overlayProps, positionProps),
		arrowProps,
		underlayProps,
		placement,
		triggerAnchorPoint: origin,
	};
}
