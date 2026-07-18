// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/grid/useGridSelectionCheckbox.ts).
// GRID SUBSET: see useGridSelectionAnnouncement.ts — only the grid-area hooks the
// gridlist area imports are ported.
// octane adaptations:
// - Upstream types the state over `GridState<T, C>`; the full grid state area is not
//   ported, and only `state.selectionManager` is read, so the parameter is a structural
//   `{ selectionManager }` bag (the gridlist caller already passed `state as any`
//   upstream).
// - The checkbox `onChange` here is the value-level AriaCheckboxProps callback (not DOM
//   wiring), so it ports unchanged.
// - The Parcel glob intl import becomes the generated src/intl/grid index (verbatim
//   dictionaries).
// - Public-hook slot threading (splitSlot/subSlot).
import type { AriaCheckboxProps } from '../checkbox/useCheckbox';
import intlMessages from '../intl/grid';
import type { Key } from '@react-types/shared';
import type { MultipleSelectionManager } from '../stately/selection/types';
import { useId } from '../utils/useId';
import { useLocalizedStringFormatter } from '../i18n/useLocalizedStringFormatter';

import { S, splitSlot, subSlot } from '../internal';

export interface AriaGridSelectionCheckboxProps {
	/** A unique key for the checkbox. */
	key: Key;
}

export interface GridSelectionCheckboxAria {
	/** Props for the row selection checkbox element. */
	checkboxProps: AriaCheckboxProps;
}

// octane adaptation: structural stand-in for upstream's GridState (only the selection
// manager is consumed here).
interface GridSelectionCheckboxState {
	selectionManager: MultipleSelectionManager;
}

/**
 * Provides the behavior and accessibility implementation for a selection checkbox in a grid.
 *
 * @param props - Props for the selection checkbox.
 * @param state - State of the grid, as returned by `useGridState`.
 */
export function useGridSelectionCheckbox(
	props: AriaGridSelectionCheckboxProps,
	state: GridSelectionCheckboxState,
): GridSelectionCheckboxAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useGridSelectionCheckbox(
	props: AriaGridSelectionCheckboxProps,
	state: GridSelectionCheckboxState,
	slot: symbol | undefined,
): GridSelectionCheckboxAria;
export function useGridSelectionCheckbox(...args: any[]): GridSelectionCheckboxAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useGridSelectionCheckbox');
	const props = user[0] as AriaGridSelectionCheckboxProps;
	const state = user[1] as GridSelectionCheckboxState;

	let { key } = props;

	let manager = state.selectionManager;
	let checkboxId = useId(subSlot(slot, 'checkboxId'));
	let isDisabled = !state.selectionManager.canSelectItem(key);
	let isSelected = state.selectionManager.isSelected(key);

	// Checkbox should always toggle selection, regardless of selectionBehavior.
	let onChange = () => manager.toggleSelection(key);

	const stringFormatter = useLocalizedStringFormatter(
		intlMessages,
		'@react-aria/grid',
		subSlot(slot, 'strings'),
	);

	return {
		checkboxProps: {
			id: checkboxId,
			'aria-label': stringFormatter.format('select'),
			isSelected,
			isDisabled,
			onChange,
		},
	};
}
