import { memo } from 'octane';
import { flexRender, getCoreRowModel, useReactTable } from '@octanejs/tanstack-table';

// flexRender triage fixtures: string header, render-fn cell, component cell
// (props captured), pre-created descriptor passthrough, undefined renderer,
// and an octane memo()-wrapped component (plain function — the branch upstream
// needed exotic-component sniffing for).

export const cellProps: unknown[] = [];

function NameCell(props: any) @{
	cellProps.push(props);
	<em class="name-cell">{'nc:' + props.getValue()}</em>
}

// NOTE: declaration + memo() — a function EXPRESSION with an @{ } body is not
// a supported syntax position for the compiler's component lowering.
function AgeCell(props: any) @{
	<strong class="age-cell">{'mc:' + props.getValue()}</strong>
}
const MemoAgeCell = memo(AgeCell);

// A PRE-CREATED element descriptor (not a function): flexRender's non-component
// branch must pass it through as-is.
const staticCell = <span class="static-cell">static</span>;

const data = [
	{ firstName: 'tanner', lastName: 'linsley', age: 29 },
	{ firstName: 'derek', lastName: 'perkins', age: 40 },
];

const columns = [
	{ accessorKey: 'firstName', header: 'First Name', cell: NameCell },
	{ accessorKey: 'lastName', header: (info: any) => 'hdr:' + info.column.id, cell: staticCell },
	{ accessorKey: 'age', header: undefined, cell: MemoAgeCell },
];

export function FlexTable() @{
	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});
	<table>
		<thead>
			@for (const hg of table.getHeaderGroups(); key hg.id) {
				<tr>
					@for (const header of hg.headers; key header.id) {
						<th id={'f-th-' + header.id}>
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
						<td id={'f-td-' + cell.id}>{flexRender(
							cell.column.columnDef.cell,
							cell.getContext(),
						)}</td>
					}
				</tr>
			}
		</tbody>
	</table>
}
