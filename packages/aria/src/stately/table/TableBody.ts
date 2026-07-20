// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/table/TableBody.ts).
// octane adaptations: React.Children → octane Children (descriptor arrays); React element
// types → `any` descriptors. Renders nothing; walked via static `getCollectionNode`.
import type { AsyncLoadable, LoadingState } from '@react-types/shared';
import { Children } from 'octane';

import type { PartialNode } from '../collections/types';
import type { RowElement } from './Row';

export interface TableBodyProps<T> extends Omit<AsyncLoadable, 'isLoading'> {
	/** The contents of the table body. Supports static items or a function for dynamic rendering. */
	children: RowElement<T> | RowElement<T>[] | ((item: T) => RowElement<T>);
	/** A list of row objects in the table body used when dynamically rendering rows. */
	items?: Iterable<T>;
	/** The current loading state of the table. */
	loadingState?: LoadingState;
}

function TableBody<T>(props: TableBodyProps<T>): any {
	return null;
}

TableBody.getCollectionNode = function* getCollectionNode<T>(
	props: TableBodyProps<T>,
): Generator<PartialNode<T>> {
	let { children, items } = props;
	yield {
		type: 'body',
		hasChildNodes: true,
		props,
		*childNodes() {
			if (typeof children === 'function') {
				if (!items) {
					throw new Error('props.children was a function but props.items is missing');
				}

				for (let item of items) {
					yield {
						type: 'item',
						value: item,
						renderer: children,
					};
				}
			} else {
				let items: PartialNode<T>[] = [];
				Children.forEach(children, (item: any) => {
					items.push({
						type: 'item',
						element: item,
					});
				});

				yield* items;
			}
		},
	};
};

/**
 * A TableBody is a container for the Row elements of a Table. Rows can be statically defined as
 * children, or generated dynamically using a function based on the data passed to the `items`
 * prop.
 */
// We don't want getCollectionNode to show up in the type definition
let _TableBody = TableBody as unknown as <T>(props: TableBodyProps<T>) => any;
export { _TableBody as TableBody };
