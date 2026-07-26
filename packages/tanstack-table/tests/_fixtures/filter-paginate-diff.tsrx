import {
	columnFilteringFeature,
	createFilteredRowModel,
	createPaginatedRowModel,
	filterFns,
	rowPaginationFeature,
	tableFeatures,
	useTable,
} from '@octanejs/tanstack-table';

const features = tableFeatures({
	columnFilteringFeature,
	rowPaginationFeature,
	filteredRowModel: createFilteredRowModel(),
	paginatedRowModel: createPaginatedRowModel(),
	filterFns,
});

// Differential fixture: column filter (controlled text input via onInput —
// octane has no synthetic onChange; React fires its synthetic change from the
// native input event, so both sides update per keystroke) + button-driven
// pagination (the rig has no `change` driver, so NO <select> here) with the
// pageIndex/pageCount surfaced as text and canPrev/canNext as disabled attrs.
const data = Array.from(
	{ length: 26 },
	(_, i) => ({
		name: String.fromCharCode(97 + i) + '-row',
		n: i,
	}),
);

const columns = [
	{ accessorKey: 'name', header: 'Name' },
	{ accessorKey: 'n', header: 'N' },
];

export function FilterPaginate() @{
	const table = useTable({
		features,
		data,
		columns,
	});
	<div>
		<input
			id="flt"
			value={table.getColumn('name')!.getFilterValue() as string ?? ''}
			onInput={(e) => table.getColumn('name')!.setFilterValue((e.target as HTMLInputElement).value)}
		/>
		<span id="pi">{table.state.pagination.pageIndex + '/' + table.getPageCount()}</span>
		<button id="prev" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
			prev
		</button>
		<button id="next" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
			next
		</button>
		<button id="ps-5" onClick={() => table.setPageSize(5)}>5</button>
		<button id="ps-20" onClick={() => table.setPageSize(20)}>20</button>
		<ul>
			@for (const row of table.getRowModel().rows; key row.id) {
				<li>{row.original.name as string}</li>
			}
		</ul>
	</div>
}
