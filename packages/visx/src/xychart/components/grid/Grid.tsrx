import { GridRows, GridColumns } from '@octanejs/visx/grid';
import type { BaseGridProps } from './BaseGrid.tsrx';
import BaseGrid from './BaseGrid.tsrx';

export type GridProps = Omit<BaseGridProps, 'GridRowsComponent' | 'GridColumnsComponent'>;

export default function Grid(props: GridProps) {
	return <BaseGrid GridRowsComponent={GridRows} GridColumnsComponent={GridColumns} {...props} />;
}
