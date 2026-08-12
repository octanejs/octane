/** @jsxImportSource octane */
import { Grid, List } from '../../../src';

function Row({ ariaAttributes, index, style }: any) {
	return (
		<div {...ariaAttributes} data-row={index} style={style}>
			{`Row ${index}`}
		</div>
	);
}

function Cell({ ariaAttributes, columnIndex, rowIndex, style }: any) {
	return (
		<div {...ariaAttributes} data-cell={`${rowIndex}:${columnIndex}`} style={style}>
			{`Cell ${rowIndex}:${columnIndex}`}
		</div>
	);
}

export function ReactWindowServerFixture() {
	return (
		<main id="react-window-server">
			<List
				data-testid="server-list"
				defaultHeight={100}
				rowComponent={Row}
				rowCount={100}
				rowHeight={20}
				rowProps={{}}
			/>
			<Grid
				cellComponent={Cell}
				cellProps={{}}
				columnCount={100}
				columnWidth={20}
				data-testid="server-grid"
				defaultHeight={40}
				defaultWidth={40}
				rowCount={100}
				rowHeight={20}
			/>
		</main>
	);
}
