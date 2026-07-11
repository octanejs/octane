import { useState } from 'octane';
import { flexRender, getCoreRowModel, useReactTable } from '@octanejs/tanstack-table';

// Self-contained differential fixture: the SAME source runs on octane (via
// @octanejs/tanstack-table) AND on React (the setup rewrites the import to
// real `@tanstack/react-table`), asserting byte-identical innerHTML. Covers
// every flexRender renderer shape (string / render-fn / component / undefined
// header + string footer) and a data swap through the render-phase setOptions.
const dataA = [
	{ firstName: 'tanner', lastName: 'linsley', age: 29 },
	{ firstName: 'derek', lastName: 'perkins', age: 45 },
	{ firstName: 'joe', lastName: 'bergevin', age: 42 },
];
const dataB = [
	{ firstName: 'kevin', lastName: 'vandy', age: 27 },
	{ firstName: 'ryan', lastName: 'carniato', age: 38 },
];

function EmCell(props: any) @{
	<em>
		{'v:' + props.getValue()}
	</em>
}

const columns = [
	{
		accessorKey: 'firstName',
		header: 'First Name',
		footer: 'fn-foot',
		cell: (info: any) => info.getValue(),
	},
	{ accessorKey: 'lastName', header: () => 'Last', cell: EmCell },
	{ accessorKey: 'age', header: undefined },
];

export function BasicTable() @{
	const [alt, setAlt] = useState(false);
	const table = useReactTable({
		data: alt ? dataB : dataA,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});
	<div>
		<button id="swap-data" onClick={() => setAlt(!alt)}>swap</button>
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
					<tr>
						@for (const cell of row.getVisibleCells(); key cell.id) {
							<td>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
						}
					</tr>
				}
			</tbody>
			<tfoot>
				@for (const fg of table.getFooterGroups(); key fg.id) {
					<tr>
						@for (const header of fg.headers; key header.id) {
							<th>
								{header.isPlaceholder
									? null
									: flexRender(header.column.columnDef.footer, header.getContext())}
							</th>
						}
					</tr>
				}
			</tfoot>
		</table>
	</div>
}
