// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/table/useTableSelectionCheckbox.ts).
// octane adaptations:
// - `TableState` comes from the ported stately table hook; `useGridSelectionCheckbox`
//   from the ported src/grid/.
// - The checkbox `onChange` is the value-level AriaCheckboxProps callback (not DOM
//   wiring), so it ports unchanged — consumers wire it to the native checkbox `change`
//   event.
// - The Parcel glob intl import becomes the generated src/intl/table index (verbatim
//   dictionaries).
// - Public-hook slot threading (splitSlot/subSlot).
import type { AriaCheckboxProps } from '../checkbox/useCheckbox';
import { getRowLabelledBy } from './utils';
import intlMessages from '../intl/table';
import type { Key } from '@react-types/shared';
import type { TableState } from '../stately/table/useTableState';
import { useGridSelectionCheckbox } from '../grid/useGridSelectionCheckbox';
import { useLocalizedStringFormatter } from '../i18n/useLocalizedStringFormatter';

import { S, splitSlot, subSlot } from '../internal';

export interface AriaTableSelectionCheckboxProps {
	/** A unique key for the checkbox. */
	key: Key;
}

export interface TableSelectionCheckboxAria {
	/** Props for the row selection checkbox element. */
	checkboxProps: AriaCheckboxProps;
}

export interface TableSelectAllCheckboxAria {
	/** Props for the select all checkbox element. */
	checkboxProps: AriaCheckboxProps;
}

/**
 * Provides the behavior and accessibility implementation for a selection checkbox in a table.
 *
 * @param props - Props for the selection checkbox.
 * @param state - State of the table, as returned by `useTableState`.
 */
export function useTableSelectionCheckbox<T>(
	props: AriaTableSelectionCheckboxProps,
	state: TableState<T>,
): TableSelectionCheckboxAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTableSelectionCheckbox<T>(
	props: AriaTableSelectionCheckboxProps,
	state: TableState<T>,
	slot: symbol | undefined,
): TableSelectionCheckboxAria;
export function useTableSelectionCheckbox(...args: any[]): TableSelectionCheckboxAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTableSelectionCheckbox');
	const props = user[0] as AriaTableSelectionCheckboxProps;
	const state = user[1] as TableState<any>;

	let { key } = props;
	const { checkboxProps } = useGridSelectionCheckbox(props, state, subSlot(slot, 'gridCheckbox'));

	return {
		checkboxProps: {
			...checkboxProps,
			'aria-labelledby': `${checkboxProps.id} ${getRowLabelledBy(state, key)}`,
		},
	};
}

/**
 * Provides the behavior and accessibility implementation for the select all checkbox in a table.
 *
 * @param props - Props for the select all checkbox.
 * @param state - State of the table, as returned by `useTableState`.
 */
export function useTableSelectAllCheckbox<T>(state: TableState<T>): TableSelectAllCheckboxAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTableSelectAllCheckbox<T>(
	state: TableState<T>,
	slot: symbol | undefined,
): TableSelectAllCheckboxAria;
export function useTableSelectAllCheckbox(...args: any[]): TableSelectAllCheckboxAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTableSelectAllCheckbox');
	const state = user[0] as TableState<any>;

	let { isEmpty, isSelectAll, selectionMode } = state.selectionManager;
	const stringFormatter = useLocalizedStringFormatter(
		intlMessages,
		'@react-aria/table',
		subSlot(slot, 'strings'),
	);

	return {
		checkboxProps: {
			'aria-label': stringFormatter.format(selectionMode === 'single' ? 'select' : 'selectAll'),
			isSelected: isSelectAll,
			isDisabled:
				selectionMode !== 'multiple' ||
				state.collection.size === 0 ||
				(state.collection.rows.length === 1 && state.collection.rows[0].type === 'loader'),
			isIndeterminate: !isEmpty && !isSelectAll,
			onChange: () => state.selectionManager.toggleSelectAll(),
		},
	};
}
