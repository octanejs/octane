// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/table/Row.ts).
// octane adaptations: React.Children → octane Children (descriptor arrays); React element
// types → `any` descriptors. Renders nothing; walked via static `getCollectionNode`.
// The `node.type === Row` check compares against the INTERNAL function identity, which is
// what descriptor `.type` carries for `<Row>` used at a value position.
import type { LinkDOMProps } from '@react-types/shared';
import { Children } from 'octane';

import type { CellElement, CellRenderer } from './Cell';
import type { CollectionBuilderContext } from './useTableState';
import type { PartialNode } from '../collections/types';

export type RowElement<T> = any;
export interface RowProps<T> extends LinkDOMProps {
	/**
	 * A list of child item objects used when dynamically rendering row children. Requires the feature
	 * flag to be enabled along with UNSTABLE_allowsExpandableRows, see
	 * https://react-spectrum.adobe.com/react-spectrum/TableView.html#expandable-rows.
	 *
	 * @private
	 * @version alpha
	 */
	UNSTABLE_childItems?: Iterable<T>;
	// TODO: update when async loading is supported for expandable rows
	// /** Whether this row has children, even if not loaded yet. */
	// hasChildItems?: boolean,
	/** Rendered contents of the row or row child items. */
	children: CellElement | CellElement[] | CellRenderer;
	/** A string representation of the row's contents, used for features like typeahead. */
	textValue?: string; // ???
}

function Row<T>(props: RowProps<T>): any {
	return null;
}

Row.getCollectionNode = function* getCollectionNode<T>(
	props: RowProps<T>,
	context: CollectionBuilderContext<T>,
): Generator<PartialNode<T>> {
	let { children, textValue, UNSTABLE_childItems } = props;

	yield {
		type: 'item',
		props: props,
		textValue,
		'aria-label': (props as any)['aria-label'],
		hasChildNodes: true,
		*childNodes() {
			// Process cells first
			if (context.showDragButtons) {
				yield {
					type: 'cell',
					key: 'header-drag', // this is combined with the row key by CollectionBuilder
					props: {
						isDragButtonCell: true,
					},
				};
			}

			if (context.showSelectionCheckboxes && context.selectionMode !== 'none') {
				yield {
					type: 'cell',
					key: 'header', // this is combined with the row key by CollectionBuilder
					props: {
						isSelectionCell: true,
					},
				};
			}

			if (typeof children === 'function') {
				for (let column of context.columns) {
					yield {
						type: 'cell',
						element: children(column.key),
						key: column.key, // this is combined with the row key by CollectionBuilder
					};
				}

				if (UNSTABLE_childItems) {
					for (let child of UNSTABLE_childItems) {
						// Note: in order to reuse the render function of TableBody for our child rows, we just need to yield a type and a value here. CollectionBuilder will then look up
						// the parent renderer and use that to build the full node of this child row, using the value provided here to generate the cells
						yield {
							type: 'item',
							value: child,
						};
					}
				}
			} else {
				let cells: PartialNode<T>[] = [];
				let childRows: PartialNode<T>[] = [];
				let columnCount = 0;
				Children.forEach(children, (node: any) => {
					if (node.type === Row) {
						if (cells.length < context.columns.length) {
							throw new Error(
								"All of a Row's child Cells must be positioned before any child Rows.",
							);
						}

						childRows.push({
							type: 'item',
							element: node,
						});
					} else {
						cells.push({
							type: 'cell',
							element: node,
						});
						columnCount += node.props.colSpan ?? 1;
					}
				});

				if (columnCount !== context.columns.length) {
					throw new Error(
						`Cell count must match column count. Found ${columnCount} cells and ${context.columns.length} columns.`,
					);
				}

				yield* cells;
				yield* childRows;
			}
		},
		shouldInvalidate(newContext: CollectionBuilderContext<T>) {
			// Invalidate all rows if the columns changed.
			return (
				newContext.columns.length !== context.columns.length ||
				newContext.columns.some((c, i) => c.key !== context.columns[i].key) ||
				newContext.showSelectionCheckboxes !== context.showSelectionCheckboxes ||
				newContext.showDragButtons !== context.showDragButtons ||
				newContext.selectionMode !== context.selectionMode
			);
		},
	};
};

/**
 * A Row represents a single item in a Table and contains Cell elements for each column.
 * Cells can be statically defined as children, or generated dynamically using a function
 * based on the columns defined in the TableHeader.
 */
// We don't want getCollectionNode to show up in the type definition
let _Row = Row as unknown as <T>(props: RowProps<T>) => any;
export { _Row as Row };
