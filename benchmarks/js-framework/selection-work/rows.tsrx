import { useEffect, useState } from 'octane';

interface Row {
	id: number;
	label: string;
}

interface Setters {
	setRows: (rows: Row[]) => void;
	setSelected: (id: number | null) => void;
}

interface Props {
	onMounted: (setters: Setters) => void;
	selectedClass: string;
}

// Keep the raw primitive holes from Pyreon PR 2985. A call such as String(row.id)
// changes the compiler's row-purity proof, and would measure a different path.
export function LiteralClassRows(props: Props) @{
	const [rows, setRows] = useState<Row[]>([]);
	const [selectedId, setSelected] = useState<number | null>(null);

	useEffect(() => {
		props.onMounted({ setRows, setSelected });
	}, []);

	<table>
		<tbody>
			@for (const row of rows; key row.id) {
				<tr class={row.id === selectedId ? 'selected' : ''}>
					<td>{row.id}</td>
					<td>{row.label}</td>
				</tr>
			}
		</tbody>
	</table>
}

// The browser supplies the same class string, but this authored dynamic arm
// cannot use the literal-class proof. It remains the same-run ordinary-row
// control even when production bundling can see its eventual prop value.
export function DynamicClassRows(props: Props) @{
	const [rows, setRows] = useState<Row[]>([]);
	const [selectedId, setSelected] = useState<number | null>(null);

	useEffect(() => {
		props.onMounted({ setRows, setSelected });
	}, []);

	<table>
		<tbody>
			@for (const row of rows; key row.id) {
				<tr class={row.id === selectedId ? props.selectedClass : ''}>
					<td>{row.id}</td>
					<td>{row.label}</td>
				</tr>
			}
		</tbody>
	</table>
}
