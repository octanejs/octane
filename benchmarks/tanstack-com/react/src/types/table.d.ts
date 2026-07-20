import type { RowData } from '@tanstack/react-table';

declare module '@tanstack/react-table' {
	interface ColumnMeta<_TData extends RowData, _TValue> {
		align?: 'left' | 'right' | 'center';
		sortable?: boolean;
		sortDescFirst?: boolean;
	}
}
