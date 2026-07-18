// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/useLabels.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; otherwise verbatim.
import type { AriaLabelingProps, DOMProps } from '@react-types/shared';

import { S, splitSlot, subSlot } from '../internal';
import { useId } from './useId';

/**
 * Merges aria-label and aria-labelledby into aria-labelledby when both exist.
 *
 * @param props - Aria label props.
 * @param defaultLabel - Default value for aria-label when not present.
 */
export function useLabels(
	props: DOMProps & AriaLabelingProps,
	defaultLabel?: string,
): DOMProps & AriaLabelingProps;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useLabels(
	props: DOMProps & AriaLabelingProps,
	defaultLabel: string | undefined,
	slot: symbol | undefined,
): DOMProps & AriaLabelingProps;
export function useLabels(...args: any[]): DOMProps & AriaLabelingProps {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useLabels');
	const props = user[0] as DOMProps & AriaLabelingProps;
	const defaultLabel = user[1] as string | undefined;

	let { id, 'aria-label': label, 'aria-labelledby': labelledBy } = props;

	// If there is both an aria-label and aria-labelledby,
	// combine them by pointing to the element itself.
	id = useId(id, subSlot(slot, 'id'));
	if (labelledBy && label) {
		let ids = new Set([id, ...labelledBy.trim().split(/\s+/)]);
		labelledBy = [...ids].join(' ');
	} else if (labelledBy) {
		labelledBy = labelledBy.trim().split(/\s+/).join(' ');
	}

	// If no labels are provided, use the default
	if (!label && !labelledBy && defaultLabel) {
		label = defaultLabel;
	}

	return {
		id,
		'aria-label': label,
		'aria-labelledby': labelledBy,
	};
}
