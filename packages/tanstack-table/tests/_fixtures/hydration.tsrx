import { useState } from 'octane';
import { tableFeatures, useTable } from '@octanejs/tanstack-table';

const features = tableFeatures({});
const columns = [{ accessorKey: 'name' as const }];
export function HydratedTable() @{
	const [name, setName] = useState('Ada');
	const table = useTable({
		features,
		columns,
		data: [
			{ id: '1', name },
		],
		getRowId: (row) => row.id,
	});
	<section>
		<button id="rename" onClick={() => setName('Grace')}>Rename</button>
		<table>
			<tbody>
				@for (const row of table.getRowModel().rows; key row.id) {
					<tr data-row={row.id}>
						<td>{row.original.name as string}</td>
					</tr>
				}
			</tbody>
		</table>
	</section>
}

export function TableChildren(props: { revision: number }) @{
	const table = useTable({ features, columns, data: [{ name: String(props.revision) }] });
	<main>
		<table.Subscribe selector={() => props.revision}>
			<span id="template">{String(props.revision)}</span>
		</table.Subscribe>
		<table.Subscribe selector={() => props.revision}>
			{(selected: number) => <output id="callback">{String(selected)}</output>}
		</table.Subscribe>
	</main>
}
