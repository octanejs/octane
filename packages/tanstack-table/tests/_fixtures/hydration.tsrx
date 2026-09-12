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
