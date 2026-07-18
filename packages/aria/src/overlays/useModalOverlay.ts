// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/overlays/useModalOverlay.ts).
// octane adaptations: `DOMAttributes` is a local structural prop-bag alias; public-hook slot
// threading (splitSlot/subSlot) per the binding convention — the composed ported hooks
// (useOverlay/usePreventScroll/useOverlayFocusContain) each receive a derived sub-slot; the
// explicit dependency array is kept verbatim; `OverlayTriggerState` from the ported stately
// overlays state; element types → `any`.
import { ariaHideOutside } from './ariaHideOutside';
import { AriaOverlayProps, useOverlay } from './useOverlay';
import type { RefObject } from '@react-types/shared';
import { mergeProps } from '../utils/mergeProps';
import type { OverlayTriggerState } from '../stately/overlays/useOverlayTriggerState';
import { useEffect } from 'octane';
import { useOverlayFocusContain } from './Overlay';
import { usePreventScroll } from './usePreventScroll';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface AriaModalOverlayProps extends Pick<
	AriaOverlayProps,
	'shouldCloseOnInteractOutside'
> {
	/**
	 * Whether to close the modal when the user interacts outside it.
	 *
	 * @default false
	 */
	isDismissable?: boolean;
	/**
	 * Whether pressing the escape key to close the modal should be disabled.
	 *
	 * @default false
	 */
	isKeyboardDismissDisabled?: boolean;
}

export interface ModalOverlayAria {
	/** Props for the modal element. */
	modalProps: DOMAttributes;
	/** Props for the underlay element. */
	underlayProps: DOMAttributes;
}

/**
 * Provides the behavior and accessibility implementation for a modal component.
 * A modal is an overlay element which blocks interaction with elements outside it.
 */
export function useModalOverlay(
	props: AriaModalOverlayProps,
	state: OverlayTriggerState,
	ref: RefObject<HTMLElement | null>,
): ModalOverlayAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useModalOverlay(
	props: AriaModalOverlayProps,
	state: OverlayTriggerState,
	ref: RefObject<HTMLElement | null>,
	slot: symbol | undefined,
): ModalOverlayAria;
export function useModalOverlay(...args: any[]): ModalOverlayAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useModalOverlay');
	const props = user[0] as AriaModalOverlayProps;
	const state = user[1] as OverlayTriggerState;
	const ref = user[2] as RefObject<HTMLElement | null>;

	let { overlayProps, underlayProps } = useOverlay(
		{
			...props,
			isOpen: state.isOpen,
			onClose: state.close,
		},
		ref,
		subSlot(slot, 'overlay'),
	);

	usePreventScroll(
		{
			isDisabled: !state.isOpen,
		},
		subSlot(slot, 'preventScroll'),
	);

	useOverlayFocusContain(subSlot(slot, 'focusContain'));

	useEffect(
		() => {
			if (state.isOpen && ref.current) {
				return ariaHideOutside([ref.current], { shouldUseInert: true });
			}
		},
		[state.isOpen, ref],
		subSlot(slot, 'hideOutside'),
	);

	return {
		modalProps: mergeProps(overlayProps),
		underlayProps,
	};
}
