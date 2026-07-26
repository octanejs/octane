import {
	createSortedRowModel,
	flexRender,
	rowSortingFeature,
	sortFns,
	tableFeatures,
	useTable,
} from '@octanejs/tanstack-table';

const features = tableFeatures({
	rowSortingFeature,
	sortedRowModel: createSortedRowModel(),
	sortFns,
});

// Differential fixture: uncontrolled sorting driven by header clicks — asc →
// desc → cleared (sortRemoval) on one column, then single-sort replacement by
// another. The sort indicator is TEXT so the byte-diff sees it.
const data = [
	{ firstName: 'tanner', age: 29 },
	{ firstName: 'derek', age: 45 },
	{ firstName: 'joe', age: 42 },
	{ firstName: 'kevin', age: 27 },
];

const columns = [
	{ accessorKey: 'firstName', header: 'Name' },
	{ accessorKey: 'age', header: 'Age' },
];

export function SortingTable() @{
	const table = useTable({
		features,
		data,
		columns,
	});
	<div>
		<button
			id="double-toggle"
			onClick={() => {
				// Two functional updaters queued in ONE event. Whatever composition
				// table-core guarantees here, both runtimes must land on it.
				table.getColumn('age')!.toggleSorting();
				table.getColumn('age')!.toggleSorting();
			}}
		>double</button>
		<table>
			<thead>
				@for (const hg of table.getHeaderGroups(); key hg.id) {
					<tr>
						@for (const header of hg.headers; key header.id) {
							<th id={'th-' + header.id} onClick={header.column.getToggleSortingHandler()}>
								{flexRender(header.column.columnDef.header, header.getContext())}
								{{ asc: ' ^', desc: ' v' }[header.column.getIsSorted() as string] ?? ''}
							</th>
						}
					</tr>
				}
			</thead>
			<tbody>
				@for (const row of table.getRowModel().rows; key row.id) {
					<tr>
						@for (const cell of row.getAllCells(); key cell.id) {
							<td>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
						}
					</tr>
				}
			</tbody>
		</table>
	</div>
}
