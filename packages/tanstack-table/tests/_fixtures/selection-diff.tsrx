import { getCoreRowModel, useReactTable } from '@octanejs/tanstack-table';

// Differential fixture: row selection with an enableRowSelection predicate.
// Checkboxes use the controlled-forms precedent — `checked={...}` with
// `onClick={handler}` (identical timing on both runtimes; the handlers read
// `e.target.checked`). `checked` is a DOM PROPERTY invisible to innerHTML, so
// the state is surfaced as text (#sel-n) and per-row data-selected attributes.
const data = [
	{ name: 'tanner', age: 29 },
	{ name: 'derek', age: 45 },
	{ name: 'joe', age: 42 },
	{ name: 'kevin', age: 17 },
];

const columns = [
	{ accessorKey: 'name', header: 'Name' },
];

export function SelectionTable() @{
	const table = useReactTable({
		data,
		columns,
		enableRowSelection: (row: any) => row.original.age > 20,
		getCoreRowModel: getCoreRowModel(),
	});
	<div>
		<input
			id="sel-all"
			type="checkbox"
			checked={table.getIsAllRowsSelected()}
			onClick={table.getToggleAllRowsSelectedHandler()}
		/>
		<span id="sel-n">{String(table.getSelectedRowModel().rows.length)}</span>
		<ul>
			@for (const row of table.getRowModel().rows; key row.id) {
				<li data-selected={row.getIsSelected() ? '1' : '0'}>
					<input
						id={'sel-' + row.id}
						type="checkbox"
						checked={row.getIsSelected()}
						disabled={!row.getCanSelect()}
						onClick={row.getToggleSelectedHandler()}
					/>
					{row.original.name as string}
				</li>
			}
		</ul>
	</div>
}
