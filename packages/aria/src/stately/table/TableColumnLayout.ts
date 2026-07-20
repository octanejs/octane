// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/table/TableColumnLayout.ts).
// Verbatim (no React surface).
import type { Key } from '@react-types/shared';

import { calculateColumnSizes, getMaxWidth, getMinWidth } from './TableUtils';
import type { ColumnSize } from './Column';
import type { GridNode } from '../grid/GridCollection';
import type { ITableCollection as TableCollection } from './TableCollection';

export interface TableColumnLayoutOptions<T> {
	getDefaultWidth?: (column: GridNode<T>) => ColumnSize | null | undefined;
	getDefaultMinWidth?: (column: GridNode<T>) => ColumnSize | null | undefined;
}

export class TableColumnLayout<T> {
	getDefaultWidth: (column: GridNode<T>) => ColumnSize | null | undefined;
	getDefaultMinWidth: (column: GridNode<T>) => ColumnSize | null | undefined;
	columnWidths: Map<Key, number> = new Map();
	columnMinWidths: Map<Key, number> = new Map();
	columnMaxWidths: Map<Key, number> = new Map();

	constructor(options: TableColumnLayoutOptions<T>) {
		this.getDefaultWidth = options?.getDefaultWidth ?? (() => '1fr');
		this.getDefaultMinWidth = options?.getDefaultMinWidth ?? (() => 75);
	}

	/**
	 * Takes an array of columns and splits it into 2 maps of columns with controlled and columns with
	 * uncontrolled widths.
	 */
	splitColumnsIntoControlledAndUncontrolled(
		columns: Array<GridNode<T>>,
	): [Map<Key, GridNode<T>>, Map<Key, GridNode<T>>] {
		return columns.reduce(
			(acc, col) => {
				if (col.props.width != null) {
					acc[0].set(col.key, col);
				} else {
					acc[1].set(col.key, col);
				}
				return acc;
			},
			[new Map(), new Map()],
		);
	}

	/** Takes uncontrolled and controlled widths and joins them into a single Map. */
	recombineColumns(
		columns: Array<GridNode<T>>,
		uncontrolledWidths: Map<Key, ColumnSize>,
		uncontrolledColumns: Map<Key, GridNode<T>>,
		controlledColumns: Map<Key, GridNode<T>>,
	): Map<Key, ColumnSize> {
		return new Map(
			columns.map((col) => {
				if (uncontrolledColumns.has(col.key)) {
					return [col.key, uncontrolledWidths.get(col.key)];
				} else {
					return [col.key, controlledColumns.get(col.key)!.props.width];
				}
			}),
		);
	}

	/** Used to make an initial Map of the uncontrolled widths based on default widths. */
	getInitialUncontrolledWidths(uncontrolledColumns: Map<Key, GridNode<T>>): Map<Key, ColumnSize> {
		return new Map(
			Array.from(uncontrolledColumns).map(([key, col]) => [
				key,
				col.props.defaultWidth ?? this.getDefaultWidth?.(col) ?? '1fr',
			]),
		);
	}

	getColumnWidth(key: Key): number {
		return this.columnWidths.get(key) ?? 0;
	}

	getColumnMinWidth(key: Key): number {
		return this.columnMinWidths.get(key) ?? 0;
	}

	getColumnMaxWidth(key: Key): number {
		return this.columnMaxWidths.get(key) ?? 0;
	}

	resizeColumnWidth(
		collection: TableCollection<T>,
		uncontrolledWidths: Map<Key, ColumnSize>,
		col: Key,
		width: number,
	): Map<Key, ColumnSize> {
		let prevColumnWidths = this.columnWidths;
		let freeze = true;
		let newWidths = new Map<Key, ColumnSize>();

		width = Math.max(
			this.getColumnMinWidth(col),
			Math.min(this.getColumnMaxWidth(col), Math.floor(width)),
		);

		collection.columns.forEach((column) => {
			if (column.key === col) {
				newWidths.set(column.key, width);
				freeze = false;
			} else if (freeze) {
				// freeze columns to the left to their previous pixel value
				newWidths.set(column.key, prevColumnWidths.get(column.key) ?? 0);
			} else {
				newWidths.set(column.key, column.props.width ?? uncontrolledWidths.get(column.key));
			}
		});

		return newWidths;
	}

	buildColumnWidths(
		tableWidth: number,
		collection: TableCollection<T>,
		widths: Map<Key, ColumnSize>,
	): Map<Key, number> {
		this.columnWidths = new Map();
		this.columnMinWidths = new Map();
		this.columnMaxWidths = new Map();

		// initial layout or table/window resizing
		let columnWidths = calculateColumnSizes(
			tableWidth,
			collection.columns.map((col) => ({ ...col.props, key: col.key })),
			widths,
			(i) => this.getDefaultWidth(collection.columns[i]),
			(i) => this.getDefaultMinWidth(collection.columns[i]),
		);

		// columns going in will be the same order as the columns coming out
		columnWidths.forEach((width, index) => {
			let key = collection.columns[index].key;
			let column = collection.columns[index];
			this.columnWidths.set(key, width);
			this.columnMinWidths.set(
				key,
				getMinWidth(column.props.minWidth ?? this.getDefaultMinWidth(column), tableWidth),
			);
			this.columnMaxWidths.set(key, getMaxWidth(column.props.maxWidth, tableWidth));
		});
		return this.columnWidths;
	}
}
