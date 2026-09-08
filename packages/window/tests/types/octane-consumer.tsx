/** @jsxImportSource octane */
import { Grid, List, type CellComponentProps, type RowComponentProps } from '../../src/index.js';

function Row({ index, label }: RowComponentProps<{ label: string }>) {
	return <div>{`${label} ${index}`}</div>;
}

function Cell({ columnIndex, rowIndex }: CellComponentProps<{ label: string }>) {
	return <div>{`${rowIndex}:${columnIndex}`}</div>;
}

// A consumer's JSX elements must be assignable both as virtualization renderers
// and as overlays passed through the children's public component props.
export const listConsumer = (
	<List rowComponent={Row} rowCount={1} rowHeight={20} rowProps={{ label: 'row' }}>
		<span>Overlay</span>
	</List>
);

export const gridConsumer = (
	<Grid
		cellComponent={Cell}
		cellProps={{ label: 'cell' }}
		columnCount={1}
		columnWidth={20}
		rowCount={1}
		rowHeight={20}
	>
		<span>Overlay</span>
	</Grid>
);
