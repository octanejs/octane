// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/table/useTableRow.ts).
// octane adaptations:
// - Handlers receive NATIVE events: the treegrid expansion keydown handler takes the
//   native KeyboardEvent.
// - `TableState`/`TreeGridState`/`ITableCollection` come from the ported stately hooks;
//   `useGridRow` from the ported src/grid/; React's `HTMLAttributes` and `DOMAttributes`
//   collapse to a structural prop bag.
// - The Parcel glob intl import becomes the generated src/intl/table index (verbatim
//   dictionaries).
// - Public-hook slot threading (splitSlot/subSlot).
import type { AriaButtonProps } from '../button/useButton';

import type { Collection, FocusableElement, Node, RefObject } from '@react-types/shared';
import { getRowLabelledBy } from './utils';
import { GridRowAria, GridRowProps, useGridRow } from '../grid/useGridRow';
import intlMessages from '../intl/table';
import type { ITableCollection } from '../stately/table/TableCollection';
import { mergeProps } from '../utils/mergeProps';
import type { TableState } from '../stately/table/useTableState';
import type { TreeGridState } from '../stately/table/useTreeGridState';
import { useLabels } from '../utils/useLabels';
import { useLocale } from '../i18n/I18nProvider';
import { useLocalizedStringFormatter } from '../i18n/useLocalizedStringFormatter';
import { useSyntheticLinkProps } from '../utils/openLink';

import { S, splitSlot, subSlot } from '../internal';

const EXPANSION_KEYS = {
	expand: {
		ltr: 'ArrowRight',
		rtl: 'ArrowLeft',
	},
	collapse: {
		ltr: 'ArrowLeft',
		rtl: 'ArrowRight',
	},
};

export interface TableRowAria extends GridRowAria {
	expandButtonProps: AriaButtonProps;
}

/**
 * Provides the behavior and accessibility implementation for a row in a table.
 *
 * @param props - Props for the row.
 * @param state - State of the table, as returned by `useTableState`.
 */
export function useTableRow<T>(
	props: GridRowProps<T>,
	state: TableState<T> | TreeGridState<T>,
	ref: RefObject<FocusableElement | null>,
): TableRowAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTableRow<T>(
	props: GridRowProps<T>,
	state: TableState<T> | TreeGridState<T>,
	ref: RefObject<FocusableElement | null>,
	slot: symbol | undefined,
): TableRowAria;
export function useTableRow(...args: any[]): TableRowAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTableRow');
	const props = user[0] as GridRowProps<any>;
	const state = user[1] as TableState<any> | TreeGridState<any>;
	const ref = user[2] as RefObject<FocusableElement | null>;

	let { node, isVirtualized } = props;
	let { rowProps, ...states } = useGridRow<any, ITableCollection<any>, TableState<any>>(
		props,
		state as TableState<any>,
		ref,
		subSlot(slot, 'gridRow'),
	);
	let { direction } = useLocale(subSlot(slot, 'locale'));

	if (isVirtualized && state.treeColumn == null) {
		rowProps['aria-rowindex'] = node.index + 1 + state.collection.headerRows.length; // aria-rowindex is 1 based
	} else {
		delete rowProps['aria-rowindex'];
	}

	let isExpanded =
		state.treeColumn != null && (state.expandedKeys === 'all' || state.expandedKeys.has(node.key));
	let stringFormatter = useLocalizedStringFormatter(
		intlMessages,
		'@react-aria/table',
		subSlot(slot, 'strings'),
	);
	let labelProps = useLabels(
		{
			'aria-label': isExpanded
				? stringFormatter.format('collapse')
				: stringFormatter.format('expand'),
			'aria-labelledby': getRowLabelledBy(state as TableState<any>, node.key),
		},
		undefined,
		subSlot(slot, 'labels'),
	);

	let treeGridRowProps: Record<string, any> = {};
	let expandButtonProps: AriaButtonProps = {};
	if (state.treeColumn != null) {
		let treeNode = state.collection.getItem(node.key);
		if (treeNode != null) {
			let lastChild = getLastChild(state.collection, node);
			let hasChildRows =
				treeNode.props?.hasChildRows ||
				treeNode.props?.UNSTABLE_childItems ||
				lastChild?.type !== 'cell';
			let parent = state.collection.getItem(node.parentKey!)!;
			let isParentBody = parent.type === 'tablebody' || parent.type === 'body';
			let lastSibling = getLastChild(state.collection, parent)!;
			while (lastSibling && lastSibling.type !== 'item' && lastSibling.prevKey != null) {
				lastSibling = state.collection.getItem(lastSibling.prevKey)!;
			}

			treeGridRowProps = {
				onKeyDown: (e: KeyboardEvent) => {
					if (
						e.key === EXPANSION_KEYS['expand'][direction] &&
						state.selectionManager.focusedKey === treeNode.key &&
						hasChildRows &&
						state.expandedKeys !== 'all' &&
						!state.expandedKeys.has(treeNode.key)
					) {
						state.toggleKey(treeNode.key);
						e.stopPropagation();
					} else if (
						e.key === EXPANSION_KEYS['collapse'][direction] &&
						state.selectionManager.focusedKey === treeNode.key
					) {
						if (state.expandedKeys !== 'all') {
							if (hasChildRows && state.expandedKeys.has(treeNode.key)) {
								state.toggleKey(treeNode.key);
								e.stopPropagation();
							} else if (
								!state.expandedKeys.has(treeNode.key) &&
								treeNode.parentKey != null &&
								treeNode.level > 0
							) {
								// Item is a leaf or already collapsed, move focus to parent
								state.selectionManager.setFocusedKey(treeNode.parentKey);
								e.stopPropagation();
							}
						} else if (state.expandedKeys === 'all') {
							state.toggleKey(treeNode.key);
							e.stopPropagation();
						}
					}
				},
				'aria-expanded': hasChildRows
					? state.expandedKeys === 'all' || state.expandedKeys.has(node.key)
					: undefined,
				'aria-level': treeNode.level + 1,
				'aria-posinset': treeNode.index - (isParentBody ? 0 : state.collection.columnCount) + 1,
				'aria-setsize': lastSibling.index - (isParentBody ? 0 : state.collection.columnCount) + 1,
			};

			expandButtonProps = {
				isDisabled: states.isDisabled,
				onPress: () => {
					if (!states.isDisabled) {
						state.toggleKey(node.key);
						state.selectionManager.setFocused(true);
						state.selectionManager.setFocusedKey(node.key);
					}
				},
				excludeFromTabOrder: true,
				preventFocusOnPress: true,
				// @ts-ignore
				'data-react-aria-prevent-focus': true,
				...labelProps,
			};
		}
	}

	let syntheticLinkProps = useSyntheticLinkProps(node.props);
	let linkProps = states.hasAction ? syntheticLinkProps : {};
	return {
		rowProps: {
			...mergeProps(rowProps, treeGridRowProps, linkProps),
			'aria-labelledby': getRowLabelledBy(state as TableState<any>, node.key),
		},
		expandButtonProps,
		...states,
	};
}

function getLastChild(collection: Collection<Node<unknown>>, node: Node<unknown>) {
	if ('lastChildKey' in node) {
		return (node as any).lastChildKey != null
			? collection.getItem((node as any).lastChildKey)
			: null;
	} else {
		return Array.from(node.childNodes).findLast((item) => item.parentKey === node.key);
	}
}
