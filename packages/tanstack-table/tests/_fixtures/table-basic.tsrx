import { useState } from 'octane';
import {
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	useReactTable,
} from '@octanejs/tanstack-table';

// Core-wiring fixtures. Data/columns are module-level (referentially stable)
// so table-core's row-model memoization isn't perturbed and render-count
// probes measure only the state wiring.

export const renders = { basic: 0, sorting: 0, controlled: 0 };
export const captured: {
	table?: unknown;
	tables: unknown[];
	sortingStates: unknown[];
	stateChanges: unknown[];
} = { tables: [], sortingStates: [], stateChanges: [] };

export const defaultData = [
	{ firstName: 'tanner', lastName: 'linsley', age: 29 },
	{ firstName: 'derek', lastName: 'perkins', age: 40 },
	{ firstName: 'joe', lastName: 'bergevin', age: 45 },
];
export const altData = [
	{ firstName: 'kevin', lastName: 'vandy', age: 27 },
	{ firstName: 'tanner', lastName: 'linsley', age: 29 },
];

const defaultColumns = [
	{
		accessorKey: 'firstName',
		header: 'First Name',
		footer: 'fn-footer',
		cell: (info: any) => info.getValue(),
	},
	{ accessorKey: 'lastName', header: () => 'Last Name', cell: (info: any) => info.getValue() },
	{ accessorKey: 'age', header: 'Age' },
];
const altColumns = [
	{ accessorKey: 'age', header: 'Only Age' },
];

// Full-markup table (thead/tbody/tfoot, all through flexRender), used both
// standalone and by the swap harness below.
export function BasicTable(props: { data?: any; columns?: any }) @{
	renders.basic++;
	const table = useReactTable({
		data: props.data ?? defaultData,
		columns: props.columns ?? defaultColumns,
		getCoreRowModel: getCoreRowModel(),
	});
	captured.table = table;
	captured.tables.push(table);
	<table>
		<thead>
			@for (const hg of table.getHeaderGroups(); key hg.id) {
				<tr>
					@for (const header of hg.headers; key header.id) {
						<th id={'th-' + header.id}>
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
						<td id={'td-' + cell.id}>{flexRender(
							cell.column.columnDef.cell,
							cell.getContext(),
						)}</td>
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
}

// Parent-driven data/columns swaps (props propagate through the render-phase
// setOptions) + an unrelated-state bump for the instance-identity probe.
export function SwapApp() @{
	const [alt, setAlt] = useState(false);
	const [altCols, setAltCols] = useState(false);
	const [bump, setBump] = useState(0);
	<div>
		<BasicTable
			data={alt ? altData : defaultData}
			columns={altCols ? altColumns : defaultColumns}
		/>
		<button id="swap-data" onClick={() => setAlt(!alt)}>data</button>
		<button id="swap-cols" onClick={() => setAltCols(!altCols)}>cols</button>
		<button id="bump" onClick={() => setBump(bump + 1)}>
			{'bump=' + bump}
		</button>
	</div>
}

// Uncontrolled sorting + render-count probe + double-toggle (functional
// updater) button. `onStateChange` here is a passthrough SPY: with no
// feature-level onSortingChange, table-core routes the sorting update through
// setState → the wrapped onStateChange, which applies internal state FIRST and
// then calls this user handler (upstream composition order).
export function SortingTable() @{
	renders.sorting++;
	const table = useReactTable({
		data: defaultData,
		columns: defaultColumns,
		onStateChange: (updater: any) => {
			captured.stateChanges.push(typeof updater);
		},
		// Keep the render-count probe clean: without this, table-core queues a
		// SECOND state update (pageIndex auto-reset) after every sorting change.
		autoResetPageIndex: false,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
	});
	captured.table = table;
	<div>
		<table>
			<thead>
				@for (const hg of table.getHeaderGroups(); key hg.id) {
					<tr>
						@for (const header of hg.headers; key header.id) {
							<th id={'s-th-' + header.id} onClick={header.column.getToggleSortingHandler()}>
								{flexRender(header.column.columnDef.header, header.getContext())}
								{{ asc: ' A', desc: ' D' }[header.column.getIsSorted() as string] ?? ''}
							</th>
						}
					</tr>
				}
			</thead>
			<tbody>
				@for (const row of table.getRowModel().rows; key row.id) {
					<tr>
						@for (const cell of row.getVisibleCells(); key cell.id) {
							<td class="s-cell">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
						}
					</tr>
				}
			</tbody>
		</table>
		<button
			id="double-toggle"
			onClick={() => {
				// Two functional updates queued in ONE event — both must apply
				// (asc, then asc→desc) before the single re-render.
				table.getColumn('age')!.toggleSorting();
				table.getColumn('age')!.toggleSorting();
			}}
		>
			double
		</button>
	</div>
}

// Partially-controlled sorting: the parent owns `sorting` (state + feature
// handler), everything else stays uncontrolled.
export function ControlledSortingTable() @{
	renders.controlled++;
	const [sorting, setSorting] = useState([] as any);
	captured.sortingStates.push(sorting);
	const table = useReactTable({
		data: defaultData,
		columns: defaultColumns,
		state: { sorting },
		onSortingChange: setSorting,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
	});
	<table>
		<thead>
			@for (const hg of table.getHeaderGroups(); key hg.id) {
				<tr>
					@for (const header of hg.headers; key header.id) {
						<th
							id={'c-th-' + header.id}
							onClick={header.column.getToggleSortingHandler()}
						>{flexRender(header.column.columnDef.header, header.getContext())}</th>
					}
				</tr>
			}
		</thead>
		<tbody>
			@for (const row of table.getRowModel().rows; key row.id) {
				<tr>
					@for (const cell of row.getVisibleCells(); key cell.id) {
						<td class="c-cell">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
					}
				</tr>
			}
		</tbody>
	</table>
}
