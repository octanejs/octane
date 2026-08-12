import { Grid, List, type CellComponentProps, type RowComponentProps } from '@octanejs/window';

type RowData = { prefix: string };
type CellData = { prefix: string };

function Row({ index, prefix, style, ariaAttributes }: RowComponentProps<RowData>) {
	return <div {...ariaAttributes} data-value={`${prefix}-${index}`} style={style}>
		{prefix}-{index}
	</div>;
}

function Cell({ columnIndex, rowIndex, prefix, style, ariaAttributes }: CellComponentProps<
	CellData
>) {
	return <div {...ariaAttributes} data-value={`${prefix}-${rowIndex}-${columnIndex}`} style={style}>
		{prefix}-{rowIndex}-{columnIndex}
	</div>;
}

export function ListFixture() {
	return <List
		defaultHeight={100}
		rowComponent={Row}
		rowCount={100}
		rowHeight={20}
		rowProps={{ prefix: 'row' }}
		style={{ height: 100, width: 200 }}
	/>;
}

export function GridFixture() {
	return <Grid
		cellComponent={Cell}
		cellProps={{ prefix: 'cell' }}
		columnCount={50}
		columnWidth={50}
		defaultHeight={100}
		defaultWidth={200}
		rowCount={100}
		rowHeight={20}
		style={{ height: 100, width: 200 }}
	/>;
}
