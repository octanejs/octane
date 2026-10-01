type Row = { id: string; label: string };
type Props = { xs: Row[]; on: (value: string) => void };
type PairProps = { xs: [string, string][]; on: (value: string) => void };

export function ObjectRows(props: Props) @{
	<ul>{props.xs.map(
		({ id, label }) => <li
			data-id={id}
			onClick={() => {
				label = label + '!';
				props.on(label);
			}}
		>{label as string}</li>,
	)}</ul>
}

export function ArrayRows(props: PairProps) @{
	<ul>{props.xs.map(
		([id, label]) => <li
			key={id}
			data-id={id}
			onClick={() => {
				label = label + '!';
				props.on(label);
			}}
		>{label as string}</li>,
	)}</ul>
}

export function IdentifierRows(props: Props) @{
	<ul>{props.xs.map(
		(row) => <li
			key={row.id}
			data-id={row.id}
			onClick={() => {
				row = { ...row, label: row.label + '!' };
				props.on(row.label);
			}}
		>{row.label as string}</li>,
	)}</ul>
}

export function LetHeaderRows(props: Props) @{
	<ul>
		@for (let { id, label } of props.xs; key id) {
			<li
				data-id={id}
				onClick={() => {
					label = label + '!';
					props.on(label);
				}}
			>{label as string}</li>
		}
	</ul>
}
