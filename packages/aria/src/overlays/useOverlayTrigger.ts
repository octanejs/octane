// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/overlays/useOverlayTrigger.ts).
// octane adaptations:
// - `OverlayTriggerState` type from the ported stately overlays state (upstream:
//   'react-stately/useOverlayTriggerState').
// - Upstream's dependency-less effect passes explicit `null` (octane's "run after every
//   render").
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention.
//
// NOTE: ported ahead of the rest of the overlays area (positioning/modal machinery is out
// of scope) because useMenuTrigger composes this aria/id wiring.
import type { AriaButtonProps } from '../button/useButton';
import type { DOMProps, RefObject } from '@react-types/shared';
import { onCloseMap } from './useCloseOnScroll';
import type { OverlayTriggerState } from '../stately/overlays/useOverlayTriggerState';
import { useEffect } from 'octane';
import { useId } from '../utils/useId';

import { S, splitSlot, subSlot } from '../internal';

export interface OverlayTriggerProps {
	/** Type of overlay that is opened by the trigger. */
	type: 'dialog' | 'menu' | 'listbox' | 'tree' | 'grid';
}

export interface OverlayTriggerAria {
	/** Props for the trigger element. */
	triggerProps: AriaButtonProps;

	/** Props for the overlay container element. */
	overlayProps: DOMProps;
}

/**
 * Handles the behavior and accessibility for an overlay trigger, e.g. a button
 * that opens a popover, menu, or other overlay that is positioned relative to the trigger.
 */
export function useOverlayTrigger(
	props: OverlayTriggerProps,
	state: OverlayTriggerState,
	ref?: RefObject<Element | null>,
): OverlayTriggerAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useOverlayTrigger(
	props: OverlayTriggerProps,
	state: OverlayTriggerState,
	ref: RefObject<Element | null> | undefined,
	slot: symbol | undefined,
): OverlayTriggerAria;
export function useOverlayTrigger(...args: any[]): OverlayTriggerAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useOverlayTrigger');
	const props = user[0] as OverlayTriggerProps;
	const state = user[1] as OverlayTriggerState;
	const ref = user[2] as RefObject<Element | null> | undefined;

	let { type } = props;
	let { isOpen } = state;

	// Backward compatibility. Share state close function with useOverlayPosition so it can close on scroll
	// without forcing users to pass onClose.
	useEffect(
		() => {
			if (ref && ref.current) {
				onCloseMap.set(ref.current, state.close);
			}
		},
		null,
		subSlot(slot, 'closeMap'),
	);

	// Aria 1.1 supports multiple values for aria-haspopup other than just menus.
	// https://www.w3.org/TR/wai-aria-1.1/#aria-haspopup
	// However, we only add it for menus for now because screen readers often
	// announce it as a menu even for other values.
	let ariaHasPopup: undefined | boolean | 'listbox' = undefined;
	if (type === 'menu') {
		ariaHasPopup = true;
	} else if (type === 'listbox') {
		ariaHasPopup = 'listbox';
	}

	let overlayId = useId(subSlot(slot, 'overlayId'));
	return {
		triggerProps: {
			'aria-haspopup': ariaHasPopup,
			'aria-expanded': isOpen,
			'aria-controls': isOpen ? overlayId : undefined,
			onPress: state.toggle,
		},
		overlayProps: {
			id: overlayId,
		},
	};
}
