import {
	createSortedRowModel,
	rowSelectionFeature,
	rowSortingFeature,
	sortFns,
	tableFeatures,
	useTable,
} from '@octanejs/tanstack-table';
import { StrongTableSnapshot } from './strong-table-snapshot.tsrx';

const features = tableFeatures({
	rowSelectionFeature,
	rowSortingFeature,
	sortedRowModel: createSortedRowModel(),
	sortFns,
});

const data = [
	{ name: 'tanner', age: 29 },
	{ name: 'derek', age: 45 },
	{ name: 'joe', age: 42 },
];

const columns = [
	{ accessorKey: 'name', header: 'Name' },
	{ accessorKey: 'age', header: 'Age' },
];

interface ExtractedCompatibilityRowProps {
	table: any;
	row: any;
	sortDirection: 'none' | 'asc' | 'desc';
}

// The extracted consumer remains in compatibility mode and owns a precise
// selection subscription. Its Strong child receives the selected boolean,
// never the stable row object with its live accessors.
function ExtractedCompatibilityRow(props: ExtractedCompatibilityRowProps) @{
	const { table, row, sortDirection } = props;
	<table.Subscribe
		source={table.atoms.rowSelection}
		selector={(selection: any) => !!selection[row.id]}
	>
		{(selected: boolean) =>
			<StrongTableSnapshot
				variant="extracted"
				rowId={row.id}
				label={row.original.name}
				selected={selected}
				sortDirection={sortDirection}
			/>}
	</table.Subscribe>
}

export function StrongTableBoundaries() @{
	// The v9 adapter wrapper is reactive and fresh for this render. Table-core
	// rows remain live objects, so this compatibility scope reads their current
	// selection before handing immutable values to Strong components.
	const table = useTable({ features, data, columns });
	const rows = table.getRowModel().rows;
	const sorted = table.getColumn('age')!.getIsSorted();
	const sortDirection =
		sorted === false ? 'none' : sorted;
	<div>
		<button id="strong-table-select" onClick={() => table.getRow('0').toggleSelected()}>
			select
		</button>
		<button id="strong-table-sort" onClick={() => table.getColumn('age')!.toggleSorting()}>
			sort
		</button>

		<ul id="strong-table-inline">{rows.map(
			(row) =>
				<StrongTableSnapshot
					key={row.id}
					variant="inline"
					rowId={row.id}
					label={row.original.name}
					selected={row.getIsSelected()}
					sortDirection={sortDirection}
				/>,
		)}</ul>

		<ul id="strong-table-for">
			@for (const row of rows; key row.id) {
				const selected = row.getIsSelected();
				<StrongTableSnapshot
					variant="for"
					rowId={row.id}
					label={row.original.name}
					selected={selected}
					sortDirection={sortDirection}
				/>
			}
		</ul>

		<ul id="strong-table-extracted">
			@for (const row of rows; key row.id) {
				<ExtractedCompatibilityRow table={table} row={row} sortDirection={sortDirection} />
			}
		</ul>
	</div>
}
