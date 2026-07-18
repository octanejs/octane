// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/disclosure/useDisclosureState.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; explicit useCallback dep arrays preserved exactly.
import { useCallback } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { useControlledState } from '../utils/useControlledState';

export interface DisclosureProps {
	/** Whether the disclosure is expanded (controlled). */
	isExpanded?: boolean;
	/** Whether the disclosure is expanded by default (uncontrolled). */
	defaultExpanded?: boolean;
	/** Handler that is called when the disclosure expanded state changes. */
	onExpandedChange?: (isExpanded: boolean) => void;
}

export interface DisclosureState {
	/** Whether the disclosure is currently expanded. */
	readonly isExpanded: boolean;
	/** Sets whether the disclosure is expanded. */
	setExpanded(isExpanded: boolean): void;
	/** Expand the disclosure. */
	expand(): void;
	/** Collapse the disclosure. */
	collapse(): void;
	/** Toggles the disclosure's visibility. */
	toggle(): void;
}

/**
 * Manages state for a disclosure widget. Tracks whether the disclosure is expanded, and provides
 * methods to toggle this state.
 */
export function useDisclosureState(props: DisclosureProps): DisclosureState;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useDisclosureState(
	props: DisclosureProps,
	slot: symbol | undefined,
): DisclosureState;
export function useDisclosureState(...args: any[]): DisclosureState {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useDisclosureState');
	const props = user[0] as DisclosureProps;

	let [isExpanded, setExpanded] = useControlledState(
		props.isExpanded,
		props.defaultExpanded || false,
		props.onExpandedChange,
		subSlot(slot, 'expanded'),
	);

	const expand = useCallback(
		() => {
			setExpanded(true);
		},
		[setExpanded],
		subSlot(slot, 'expand'),
	);

	const collapse = useCallback(
		() => {
			setExpanded(false);
		},
		[setExpanded],
		subSlot(slot, 'collapse'),
	);

	const toggle = useCallback(
		() => {
			setExpanded(!isExpanded);
		},
		[setExpanded, isExpanded],
		subSlot(slot, 'toggle'),
	);

	return {
		isExpanded,
		setExpanded,
		expand,
		collapse,
		toggle,
	};
}
