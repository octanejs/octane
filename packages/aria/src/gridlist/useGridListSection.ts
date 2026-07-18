// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/gridlist/useGridListSection.ts).
// octane adaptations: `ListState` comes from the ported stately list hook;
// `DOMAttributes` is a local structural prop-bag alias; public-hook slot threading.
import type { RefObject } from '@react-types/shared';
import type { ListState } from '../stately/list/useListState';
import { useLabels } from '../utils/useLabels';
import { useSlotId } from '../utils/useId';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface AriaGridListSectionProps {
	/** An accessibility label for the section. Required if `heading` is not present. */
	'aria-label'?: string;
}

export interface GridListSectionAria {
	/** Props for the wrapper list item. */
	rowProps: DOMAttributes;

	/** Props for the heading element, if any. */
	rowHeaderProps: DOMAttributes;

	/** Props for the grid's row group element. */
	rowGroupProps: DOMAttributes;
}

/**
 * Provides the behavior and accessibility implementation for a section in a grid list.
 * See `useGridList` for more details about grid list.
 *
 * @param props - Props for the section.
 */
export function useGridListSection<T>(
	props: AriaGridListSectionProps,
	state: ListState<T>,
	ref: RefObject<HTMLElement | null>,
): GridListSectionAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useGridListSection<T>(
	props: AriaGridListSectionProps,
	state: ListState<T>,
	ref: RefObject<HTMLElement | null>,
	slot: symbol | undefined,
): GridListSectionAria;
export function useGridListSection(...args: any[]): GridListSectionAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useGridListSection');
	const props = user[0] as AriaGridListSectionProps;

	let { 'aria-label': ariaLabel } = props;
	let headingId = useSlotId(undefined, subSlot(slot, 'headingId'));
	let labelProps = useLabels(
		{
			'aria-label': ariaLabel,
			'aria-labelledby': headingId,
		},
		undefined,
		subSlot(slot, 'labels'),
	);

	return {
		rowProps: {
			role: 'row',
		},
		rowHeaderProps: {
			id: headingId,
			role: 'rowheader',
		},
		rowGroupProps: {
			role: 'rowgroup',
			...labelProps,
		},
	};
}
