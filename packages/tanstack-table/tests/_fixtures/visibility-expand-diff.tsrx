import {
	columnVisibilityFeature,
	createExpandedRowModel,
	flexRender,
	rowExpandingFeature,
	tableFeatures,
	useTable,
} from '@octanejs/tanstack-table';

const features = tableFeatures({
	columnVisibilityFeature,
	rowExpandingFeature,
	expandedRowModel: createExpandedRowModel(),
});

// Differential fixture: column visibility toggles (buttons calling
// toggleVisibility() directly — the checkbox-handler form reads
// e.target.checked) + expanding with two-level subRows. Depth is surfaced as
// a data attribute (not inline style) so serialization is trivially identical.
const data = [
	{
		name: 'root-a',
		size: 3,
		subRows: [
			{ name: 'a-1', size: 1 },
			{
				name: 'a-2',
				size: 2,
				subRows: [
					{ name: 'a-2-x', size: 1 },
				],
			},
		],
	},
	{ name: 'root-b', size: 1 },
];

const columns = [
	{ accessorKey: 'name', header: 'Name' },
	{ accessorKey: 'size', header: 'Size' },
];

export function VisExpand() @{
	const table = useTable({
		features,
		data,
		columns,
		getSubRows: (row: any) => row.subRows,
	});
	<div>
		@for (const col of table.getAllLeafColumns(); key col.id) {
			<button
				id={'vis-' + col.id}
				onClick={() => col.toggleVisibility()}
			>{col.id as string}</button>
		}
		<table>
			<thead>
				@for (const hg of table.getHeaderGroups(); key hg.id) {
					<tr>
						@for (const header of hg.headers; key header.id) {
							<th>
								{header.isPlaceholder
									? null
									: flexRender(header.column.columnDef.header, header.getContext())}
							</th>
						}
					</tr>
				}
			</thead>
			<tbody>
				@for (const row of table.getRowModel().rows; key row.id) {
					<tr data-depth={String(row.depth)}>
						<td>
							@if (row.getCanExpand()) {
								<button class="exp" data-for={row.id} onClick={row.getToggleExpandedHandler()}>
									{row.getIsExpanded() ? '-' : '+'}
								</button>
							}
						</td>
						@for (const cell of row.getVisibleCells(); key cell.id) {
							<td>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
						}
					</tr>
				}
			</tbody>
		</table>
	</div>
}
