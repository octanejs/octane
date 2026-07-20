// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/table/Column.ts).
// octane adaptations: React.Children → octane Children (descriptor arrays); React element
// types → `any` descriptors. Renders nothing; walked via static `getCollectionNode`.
import { Children } from 'octane';

import type { CollectionBuilderContext } from './useTableState';
import type { GridNode } from '../grid/GridCollection';
import type { PartialNode } from '../collections/types';

/** Widths that result in a constant pixel value for the same Table width. */
export type ColumnStaticSize = number | `${number}` | `${number}%`; // match regex: /^(\d+)(?=%$)/
/**
 * Widths that change size in relation to the remaining space and in ratio to other dynamic columns.
 * All numbers must be integers and greater than 0.
 * FR units take up remaining, if any, space in the table.
 */
export type ColumnDynamicSize = `${number}fr`; // match regex: /^(\d+)(?=fr$)/
/** All possible sizes a column can be assigned. */
export type ColumnSize = ColumnStaticSize | ColumnDynamicSize;

export type ColumnElement<T> = any;
export type ColumnRenderer<T> = (item: T) => ColumnElement<T>;
export interface ColumnProps<T> {
	/** Rendered contents of the column if `children` contains child columns. */
	title?: any;
	/** Static child columns or content to render as the column header. */
	children: any;
	/** A list of child columns used when dynamically rendering nested child columns. */
	childColumns?: T[];
	/** The width of the column. */
	width?: ColumnSize | null;
	/** The minimum width of the column. */
	minWidth?: ColumnStaticSize | null;
	/** The maximum width of the column. */
	maxWidth?: ColumnStaticSize | null;
	/** The default width of the column. */
	defaultWidth?: ColumnSize | null;
	/** Whether the column allows resizing. */
	allowsResizing?: boolean;
	/** Whether the column allows sorting. */
	allowsSorting?: boolean;
	/**
	 * Whether a column is a [row header](https://www.w3.org/TR/wai-aria-1.1/#rowheader) and should be
	 * announced by assistive technology during row navigation.
	 */
	isRowHeader?: boolean;
	/** A string representation of the column's contents, used for accessibility announcements. */
	textValue?: string;
}

function Column<T>(props: ColumnProps<T>): any {
	return null;
}

Column.getCollectionNode = function* getCollectionNode<T>(
	props: ColumnProps<T>,
	context: CollectionBuilderContext<T>,
): Generator<PartialNode<T>, void, GridNode<T>[]> {
	let { title, children, childColumns } = props;

	let rendered = title || children;
	let textValue =
		props.textValue ||
		(typeof rendered === 'string' ? rendered : '') ||
		(props as any)['aria-label'];

	let fullNodes = yield {
		type: 'column',
		hasChildNodes: !!childColumns || (!!title && Children.count(children) > 0),
		rendered,
		textValue,
		props,
		*childNodes() {
			if (childColumns) {
				for (let child of childColumns) {
					yield {
						type: 'column',
						value: child,
					};
				}
			} else if (title) {
				let childColumns: PartialNode<T>[] = [];
				Children.forEach(children, (child: any) => {
					childColumns.push({
						type: 'column',
						element: child,
					});
				});

				yield* childColumns;
			}
		},
		shouldInvalidate(newContext: CollectionBuilderContext<T>) {
			// This is a bit of a hack, but it works.
			// If this method is called, then there's a cached version of this node available.
			// But, we need to keep the list of columns in the new context up to date.
			updateContext(newContext);
			return false;
		},
	};

	let updateContext = (context: CollectionBuilderContext<T>) => {
		// register leaf columns on the context so that <Row> can access them
		for (let node of fullNodes) {
			if (!node.hasChildNodes) {
				context.columns.push(node);
			}
		}
	};

	updateContext(context);
};

/**
 * A Column represents a field of each item within a Table. Columns may also contain nested
 * Column elements to represent column groups. Nested columns can be statically defined as
 * children, or dynamically generated using a function based on the `childColumns` prop.
 */
// We don't want getCollectionNode to show up in the type definition
let _Column = Column as unknown as <T>(props: ColumnProps<T>) => any;
export { _Column as Column };
