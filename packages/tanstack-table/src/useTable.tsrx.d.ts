// Declaration companion for this module only.
import type { RowData, TableFeatures, TableOptions, TableState } from '@tanstack/table-core';
import type { OctaneTable } from './types';

export declare function useTable<
	TFeatures extends TableFeatures,
	TData extends RowData,
	TSelected = TableState<TFeatures>,
>(
	tableOptions: TableOptions<TFeatures, TData>,
	selector?: (state: TableState<TFeatures>) => TSelected,
): OctaneTable<TFeatures, TData, TSelected>;
