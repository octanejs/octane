// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/table/useTable.ts).
// octane adaptations:
// - `TableState`/`TreeGridState` come from the ported stately table hooks; the grid-area
//   imports resolve to the ported src/grid/ modules.
// - The Parcel glob intl import becomes the generated src/intl/table index (verbatim
//   dictionaries).
// - Public-hook slot threading (splitSlot/subSlot); explicit dependency arrays are kept
//   verbatim.
import { announce } from '../live-announcer/LiveAnnouncer';

import { GridAria, GridProps, useGrid } from '../grid/useGrid';
import { gridIds } from './utils';
import intlMessages from '../intl/table';
import type { Key, LayoutDelegate, Rect, RefObject, Size } from '@react-types/shared';
import { mergeProps } from '../utils/mergeProps';
import { TableKeyboardDelegate } from './TableKeyboardDelegate';
import type { TableState } from '../stately/table/useTableState';
import type { TreeGridState } from '../stately/table/useTreeGridState';
import { useCollator } from '../i18n/useCollator';
import { useDescription } from '../utils/useDescription';
import { useId } from '../utils/useId';
import { useLocale } from '../i18n/I18nProvider';
import { useLocalizedStringFormatter } from '../i18n/useLocalizedStringFormatter';
import { useMemo } from 'octane';
import { useUpdateEffect } from '../utils/useUpdateEffect';

import { S, splitSlot, subSlot } from '../internal';

export interface AriaTableProps extends GridProps {
	/**
	 * The layout object for the table. Computes what content is visible and how to position and style
	 * them.
	 */
	layoutDelegate?: LayoutDelegate;
	/** @deprecated - Use layoutDelegate instead. */
	layout?: DeprecatedLayout;
}

interface DeprecatedLayout {
	getLayoutInfo(key: Key): DeprecatedLayoutInfo;
	getContentSize(): Size;
	virtualizer: DeprecatedVirtualizer;
}

interface DeprecatedLayoutInfo {
	rect: Rect;
}

interface DeprecatedVirtualizer {
	visibleRect: Rect;
}

/**
 * Provides the behavior and accessibility implementation for a table component. A table displays
 * data in rows and columns and enables a user to navigate its contents via directional navigation
 * keys, and optionally supports row selection and sorting.
 *
 * @param props - Props for the table.
 * @param state - State for the table, as returned by `useTableState`.
 * @param ref - The ref attached to the table element.
 */
export function useTable<T>(
	props: AriaTableProps,
	state: TableState<T> | TreeGridState<T>,
	ref: RefObject<HTMLElement | null>,
): GridAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTable<T>(
	props: AriaTableProps,
	state: TableState<T> | TreeGridState<T>,
	ref: RefObject<HTMLElement | null>,
	slot: symbol | undefined,
): GridAria;
export function useTable(...args: any[]): GridAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTable');
	const props = user[0] as AriaTableProps;
	const state = user[1] as TableState<any> | TreeGridState<any>;
	const ref = user[2] as RefObject<HTMLElement | null>;

	let { keyboardDelegate, isVirtualized, layoutDelegate, layout } = props;

	// By default, a KeyboardDelegate is provided which uses the DOM to query layout information (e.g. for page up/page down).
	// When virtualized, the layout object will be passed in as a prop and override this.
	let collator = useCollator({ usage: 'search', sensitivity: 'base' }, subSlot(slot, 'collator'));
	let { direction } = useLocale(subSlot(slot, 'locale'));
	let disabledBehavior = state.selectionManager.disabledBehavior;
	let delegate = useMemo(
		() =>
			keyboardDelegate ||
			new TableKeyboardDelegate({
				collection: state.collection,
				disabledKeys: state.disabledKeys,
				disabledBehavior,
				ref,
				direction,
				collator,
				layoutDelegate,
				layout,
			}),
		[
			keyboardDelegate,
			state.collection,
			state.disabledKeys,
			disabledBehavior,
			ref,
			direction,
			collator,
			layoutDelegate,
			layout,
		],
		subSlot(slot, 'delegate'),
	);
	let id = useId(props.id, subSlot(slot, 'id'));
	gridIds.set(state as TableState<any>, id);

	let { gridProps } = useGrid(
		{
			...props,
			id,
			keyboardDelegate: delegate,
		},
		state,
		ref,
		subSlot(slot, 'grid'),
	);

	// Override to include header rows
	if (isVirtualized) {
		gridProps['aria-rowcount'] = state.collection.size + state.collection.headerRows.length;
	}

	if (state.treeColumn != null) {
		gridProps.role = 'treegrid';
	}

	let { column, direction: sortDirection } = state.sortDescriptor || {};
	let stringFormatter = useLocalizedStringFormatter(
		intlMessages,
		'@react-aria/table',
		subSlot(slot, 'strings'),
	);
	let sortDescription = useMemo(
		() => {
			let columnName = state.collection.columns.find((c) => c.key === column)?.textValue ?? '';
			return sortDirection && column
				? stringFormatter.format(`${sortDirection}Sort`, { columnName })
				: undefined;
		},
		[sortDirection, column, state.collection.columns],
		subSlot(slot, 'sortDescription'),
	);

	let descriptionProps = useDescription(sortDescription, subSlot(slot, 'description'));

	// Only announce after initial render, tabbing to the table will tell you the initial sort info already
	useUpdateEffect(
		() => {
			if (sortDescription) {
				announce(sortDescription, 'assertive', 500);
			}
		},
		[sortDescription],
		subSlot(slot, 'announceSort'),
	);

	return {
		gridProps: mergeProps(gridProps, descriptionProps, {
			// merge sort description with long press information
			'aria-describedby': [descriptionProps['aria-describedby'], gridProps['aria-describedby']]
				.filter(Boolean)
				.join(' '),
		}),
	};
}
