/** @jsxImportSource octane */
import { useState } from 'octane';
import {
	Grid,
	List,
	useGridRef,
	type CellComponentProps,
	type RowComponentProps,
} from '../../../src';

function Row({ ariaAttributes, index, style }: RowComponentProps) {
	return <div {...ariaAttributes} data-item={index} style={style}>{`Row ${index}`}</div>;
}
function Cell({ ariaAttributes, rowIndex, columnIndex, style }: CellComponentProps) {
	return (
		<div
			{...ariaAttributes}
			data-item={`${rowIndex}:${columnIndex}`}
			style={style}
		>{`Cell ${rowIndex}:${columnIndex}`}</div>
	);
}
export function WindowBrowserFixture({ kind }: { kind: 'list' | 'grid' }) {
	const [dir, setDir] = useState<'ltr' | 'rtl'>('ltr');
	const grid = useGridRef(null);
	return (
		<main>
			<button id="direction" onClick={() => setDir((value) => (value === 'ltr' ? 'rtl' : 'ltr'))}>
				Change direction
			</button>
			<button
				id="scroll"
				onClick={() => grid.current?.scrollToColumn({ index: 5, align: 'start' })}
			>
				Scroll to column 5
			</button>
			{kind === 'list' ? (
				<List
					id="virtualizer"
					defaultHeight={300}
					overscanCount={0}
					rowComponent={Row}
					rowCount={1000}
					rowHeight={30}
					rowProps={{}}
					style={{ height: 300, width: 300 }}
				/>
			) : (
				<Grid
					id="virtualizer"
					gridRef={grid}
					dir={dir}
					defaultHeight={300}
					defaultWidth={300}
					overscanCount={0}
					cellComponent={Cell}
					cellProps={{}}
					columnCount={1000}
					columnWidth={100}
					rowCount={1000}
					rowHeight={30}
					style={{ height: 300, width: 300 }}
				/>
			)}
			<footer id="after">After virtualizer</footer>
		</main>
	);
}
