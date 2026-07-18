// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/tooltip/useTooltipTrigger.ts).
// octane adaptations:
// - `DOMAttributes` is a local structural prop-bag alias (upstream's is typed over React's
//   synthetic handlers); the global keydown listener receives a native KeyboardEvent.
// - `TooltipTriggerProps`/`TooltipTriggerState` are imported from the ported stately hook,
//   not a bare `react-stately/...` specifier.
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention; the explicit
//   useEffect dep array is kept verbatim with a trailing subSlot.
import type { FocusableElement, RefObject } from '@react-types/shared';
import { getInteractionModality, isFocusVisible } from '../interactions/useFocusVisible';
import { mergeProps } from '../utils/mergeProps';
import type {
	TooltipTriggerProps,
	TooltipTriggerState,
} from '../stately/tooltip/useTooltipTriggerState';
import { useEffect, useRef } from 'octane';
import { useFocusable } from '../interactions/useFocusable';
import { useHover } from '../interactions/useHover';
import { useId } from '../utils/useId';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface TooltipTriggerAria {
	/**
	 * Props for the trigger element.
	 */
	triggerProps: DOMAttributes;

	/**
	 * Props for the overlay container element.
	 */
	tooltipProps: DOMAttributes;
}

/**
 * Provides the behavior and accessibility implementation for a tooltip trigger, e.g. a button
 * that shows a description when focused or hovered.
 */
export function useTooltipTrigger(
	props: TooltipTriggerProps,
	state: TooltipTriggerState,
	ref: RefObject<FocusableElement | null>,
): TooltipTriggerAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTooltipTrigger(
	props: TooltipTriggerProps,
	state: TooltipTriggerState,
	ref: RefObject<FocusableElement | null>,
	slot: symbol | undefined,
): TooltipTriggerAria;
export function useTooltipTrigger(...args: any[]): TooltipTriggerAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTooltipTrigger');
	const props = user[0] as TooltipTriggerProps;
	const state = user[1] as TooltipTriggerState;
	const ref = user[2] as RefObject<FocusableElement | null>;

	let { isDisabled, trigger, shouldCloseOnPress = true } = props;

	let tooltipId = useId(subSlot(slot, 'id'));

	let isHovered = useRef(false, subSlot(slot, 'isHovered'));
	let isFocused = useRef(false, subSlot(slot, 'isFocused'));

	let handleShow = () => {
		if (isHovered.current || isFocused.current) {
			state.open(isFocused.current);
		}
	};

	let handleHide = (immediate?: boolean) => {
		if (!isHovered.current && !isFocused.current) {
			state.close(immediate);
		}
	};

	useEffect(
		() => {
			let onKeyDown = (e: KeyboardEvent) => {
				if (ref && ref.current) {
					// Escape after clicking something can give it keyboard focus
					// dismiss tooltip on esc key press
					if (e.key === 'Escape') {
						e.stopPropagation();
						state.close(true);
					}
				}
			};
			if (state.isOpen) {
				document.addEventListener('keydown', onKeyDown, true);
				return () => {
					document.removeEventListener('keydown', onKeyDown, true);
				};
			}
		},
		[ref, state],
		subSlot(slot, 'keydown'),
	);

	let onHoverStart = () => {
		if (trigger === 'focus') {
			return;
		}
		// In chrome, if you hover a trigger, then another element obscures it, due to keyboard
		// interactions for example, hover will end. When hover is restored after that element disappears,
		// focus moves on for example, then the tooltip will reopen. We check the modality to know if the hover
		// is the result of moving the mouse.
		if (getInteractionModality() === 'pointer') {
			isHovered.current = true;
		} else {
			isHovered.current = false;
		}
		handleShow();
	};

	let onHoverEnd = () => {
		if (trigger === 'focus') {
			return;
		}
		// no matter how the trigger is left, we should close the tooltip
		isFocused.current = false;
		isHovered.current = false;
		handleHide();
	};

	let onPressStart = () => {
		// if shouldCloseOnPress is false, we should not close the tooltip
		if (!shouldCloseOnPress) {
			return;
		}
		// no matter how the trigger is pressed, we should close the tooltip
		isFocused.current = false;
		isHovered.current = false;
		handleHide(true);
	};

	let onFocus = () => {
		let isVisible = isFocusVisible();
		if (isVisible) {
			isFocused.current = true;
			handleShow();
		}
	};

	let onBlur = () => {
		isFocused.current = false;
		isHovered.current = false;
		handleHide(true);
	};

	let { hoverProps } = useHover(
		{
			isDisabled,
			onHoverStart,
			onHoverEnd,
		},
		subSlot(slot, 'hover'),
	);

	let { focusableProps } = useFocusable(
		{
			isDisabled,
			onFocus,
			onBlur,
		},
		ref,
		subSlot(slot, 'focusable'),
	);

	return {
		triggerProps: {
			'aria-describedby': state.isOpen ? tooltipId : undefined,
			...mergeProps(focusableProps, hoverProps, {
				onPointerDown: onPressStart,
				onKeyDown: onPressStart,
			}),
			tabIndex: undefined,
		},
		tooltipProps: {
			id: tooltipId,
		},
	};
}
