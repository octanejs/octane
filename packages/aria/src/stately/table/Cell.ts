// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/table/Cell.ts).
// octane adaptations: React element types → `any` (octane element descriptors). `<Cell>` is
// a collection DESCRIPTOR component — it renders nothing; CollectionBuilder walks it via
// the static `getCollectionNode` generator.
import type { Key } from '@react-types/shared';
import type { PartialNode } from '../collections/types';

export interface CellProps {
	/** The contents of the cell. */
	children: any;
	/** A string representation of the cell's contents, used for features like typeahead. */
	textValue?: string;
	/** Indicates how many columns the data cell spans. */
	colSpan?: number;
}

export type CellElement = any;
export type CellRenderer = (columnKey: Key) => CellElement;

function Cell(props: CellProps): any {
	return null;
}

Cell.getCollectionNode = function* getCollectionNode<T>(
	props: CellProps,
): Generator<PartialNode<T>> {
	let { children } = props;

	let textValue =
		props.textValue ||
		(typeof children === 'string' ? children : '') ||
		(props as any)['aria-label'] ||
		'';
	yield {
		type: 'cell',
		props: props,
		rendered: children,
		textValue,
		'aria-label': (props as any)['aria-label'],
		hasChildNodes: false,
	};
};

/**
 * A Cell represents the value of a single Column within a Table Row.
 */
// We don't want getCollectionNode to show up in the type definition
let _Cell = Cell as unknown as (props: CellProps) => any;
export { _Cell as Cell };
