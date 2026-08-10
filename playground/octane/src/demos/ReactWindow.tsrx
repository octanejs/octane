import { Grid, List, type CellComponentProps, type RowComponentProps } from '@octanejs/window';

function Row({ index, style, ariaAttributes }: RowComponentProps) {
	return <div
		{...ariaAttributes}
		style={{
			...style,
			alignItems: 'center',
			borderBottom: '1px solid var(--border)',
			display: 'flex',
			paddingInline: 12,
		}}
	>
		{'Row ' + index}
	</div>;
}

function Cell({ columnIndex, rowIndex, style, ariaAttributes }: CellComponentProps) {
	return <div
		{...ariaAttributes}
		style={{
			...style,
			alignItems: 'center',
			borderBottom: '1px solid var(--border)',
			borderRight: '1px solid var(--border)',
			display: 'flex',
			justifyContent: 'center',
		}}
	>
		{rowIndex + ':' + columnIndex}
	</div>;
}

export function ReactWindowDemo() @{
	<div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
		<section>
			<h2>{'10,000-row List'}</h2>
			<List
				defaultHeight={320}
				rowComponent={Row}
				rowCount={10_000}
				rowHeight={36}
				rowProps={{}}
				style={{ border: '1px solid var(--border)', height: 320 }}
			/>
		</section>
		<section>
			<h2>{'1,000 × 1,000 Grid'}</h2>
			<Grid
				cellComponent={Cell}
				cellProps={{}}
				columnCount={1_000}
				columnWidth={88}
				defaultHeight={320}
				defaultWidth={480}
				rowCount={1_000}
				rowHeight={36}
				style={{ border: '1px solid var(--border)', height: 320, width: '100%' }}
			/>
		</section>
	</div>
}
