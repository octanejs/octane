// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/table/TableHeader.ts).
// octane adaptations: React.Children → octane Children (descriptor arrays); React element
// types → `any` descriptors. Renders nothing; walked via static `getCollectionNode`.
import { Children } from 'octane';

import type { CollectionBuilderContext } from './useTableState';
import type { ColumnElement, ColumnRenderer } from './Column';
import type { PartialNode } from '../collections/types';

export interface TableHeaderProps<T> {
	/** A list of table columns. */
	columns?: readonly T[];
	/**
	 * A list of `Column(s)` or a function. If the latter, a list of columns must be provided using
	 * the `columns` prop.
	 */
	children: ColumnElement<T> | ColumnElement<T>[] | ColumnRenderer<T>;
}

function TableHeader<T>(props: TableHeaderProps<T>): any {
	return null;
}

TableHeader.getCollectionNode = function* getCollectionNode<T>(
	props: TableHeaderProps<T>,
	context: CollectionBuilderContext<T>,
): Generator<PartialNode<T>, void, any> {
	let { children, columns } = props;

	// Clear columns so they aren't double added in strict mode.
	context.columns = [];

	if (typeof children === 'function') {
		if (!columns) {
			throw new Error('props.children was a function but props.columns is missing');
		}

		for (let column of columns) {
			yield {
				type: 'column',
				value: column,
				renderer: children,
			};
		}
	} else {
		let columns: PartialNode<T>[] = [];
		Children.forEach(children, (column: any) => {
			columns.push({
				type: 'column',
				element: column,
			});
		});

		yield* columns;
	}
};

/**
 * A TableHeader is a container for the Column elements in a Table. Columns can be statically
 * defined as children, or generated dynamically using a function based on the data passed to the
 * `columns` prop.
 */
// We don't want getCollectionNode to show up in the type definition
let _TableHeader = TableHeader as unknown as <T>(props: TableHeaderProps<T>) => any;
export { _TableHeader as TableHeader };
