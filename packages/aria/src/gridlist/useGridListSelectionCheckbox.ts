// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/gridlist/useGridListSelectionCheckbox.ts).
// octane adaptations: `ListState` comes from the ported stately list hook; the grid-area
// import resolves to the ported GRID SUBSET useGridSelectionCheckbox (whose state
// parameter is structural, so upstream's `state as any` cast collapses); public-hook
// slot threading.
import {
	AriaGridSelectionCheckboxProps,
	GridSelectionCheckboxAria,
	useGridSelectionCheckbox,
} from '../grid/useGridSelectionCheckbox';
import { getRowId } from './utils';
import type { ListState } from '../stately/list/useListState';

import { S, splitSlot, subSlot } from '../internal';

/**
 * Provides the behavior and accessibility implementation for a selection checkbox in a grid list.
 *
 * @param props - Props for the selection checkbox.
 * @param state - State of the list, as returned by `useListState`.
 */
export function useGridListSelectionCheckbox<T>(
	props: AriaGridSelectionCheckboxProps,
	state: ListState<T>,
): GridSelectionCheckboxAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useGridListSelectionCheckbox<T>(
	props: AriaGridSelectionCheckboxProps,
	state: ListState<T>,
	slot: symbol | undefined,
): GridSelectionCheckboxAria;
export function useGridListSelectionCheckbox(...args: any[]): GridSelectionCheckboxAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useGridListSelectionCheckbox');
	const props = user[0] as AriaGridSelectionCheckboxProps;
	const state = user[1] as ListState<any>;

	let { key } = props;
	const { checkboxProps } = useGridSelectionCheckbox(props, state, subSlot(slot, 'checkbox'));

	return {
		checkboxProps: {
			...checkboxProps,
			'aria-labelledby': `${checkboxProps.id} ${getRowId(state, key)}`,
		},
	};
}
