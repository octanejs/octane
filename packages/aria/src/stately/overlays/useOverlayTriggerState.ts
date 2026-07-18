// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/overlays/useOverlayTriggerState.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; the public value-level `onOpenChange` callback is unchanged (the onInput
// rule applies only to DOM wiring); explicit dependency arrays are kept verbatim.
import { useCallback } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { useControlledState } from '../utils/useControlledState';

export interface OverlayTriggerProps {
	/** Whether the overlay is open by default (controlled). */
	isOpen?: boolean;
	/** Whether the overlay is open by default (uncontrolled). */
	defaultOpen?: boolean;
	/** Handler that is called when the overlay's open state changes. */
	onOpenChange?: (isOpen: boolean) => void;
}

export interface OverlayTriggerState {
	/** Whether the overlay is currently open. */
	readonly isOpen: boolean;
	/** Sets whether the overlay is open. */
	setOpen(isOpen: boolean): void;
	/** Opens the overlay. */
	open(): void;
	/** Closes the overlay. */
	close(): void;
	/** Toggles the overlay's visibility. */
	toggle(): void;
}

/**
 * Manages state for an overlay trigger. Tracks whether the overlay is open, and provides
 * methods to toggle this state.
 */
export function useOverlayTriggerState(props: OverlayTriggerProps): OverlayTriggerState;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useOverlayTriggerState(
	props: OverlayTriggerProps,
	slot: symbol | undefined,
): OverlayTriggerState;
export function useOverlayTriggerState(...args: any[]): OverlayTriggerState {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useOverlayTriggerState');
	const props = user[0] as OverlayTriggerProps;

	let [isOpen, setOpen] = useControlledState(
		props.isOpen,
		props.defaultOpen || false,
		props.onOpenChange,
		subSlot(slot, 'open'),
	);

	const open = useCallback(
		() => {
			setOpen(true);
		},
		[setOpen],
		subSlot(slot, 'openCb'),
	);

	const close = useCallback(
		() => {
			setOpen(false);
		},
		[setOpen],
		subSlot(slot, 'closeCb'),
	);

	const toggle = useCallback(
		() => {
			setOpen(!isOpen);
		},
		[setOpen, isOpen],
		subSlot(slot, 'toggleCb'),
	);

	return {
		isOpen,
		setOpen,
		open,
		close,
		toggle,
	};
}
