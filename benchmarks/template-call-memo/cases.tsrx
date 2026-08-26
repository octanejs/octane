type Row = { readonly id: number; readonly label: string; read(suffix: string): string };
type Props = { rows: readonly Row[]; suffix: string; tick: number };

export function Rows({ rows, suffix, tick }: Props) @{
	<section>
		<output>{String(tick)}</output>
		<ul>
			@for (const row of rows; key row.id) {
				<li data-row={row.id}>
					<span>{row.read(suffix) as string}</span>
				</li>
			}
		</ul>
	</section>
}

export function LoggedRows({ rows, suffix, tick }: Props) @{
	<section>
		<output>{String(tick)}</output>
		<ul>
			@for (const row of rows; key row.id) {
				console.log('row', row.id);
				<li data-row={row.id}>
					<span>{row.read(suffix) as string}</span>
				</li>
			}
		</ul>
	</section>
}

export function CapturedRows({ rows, suffix, tick, onRows }: Props & {
	onRows: (rows: readonly Row[]) => void;
}) @{
	<section>
		<output>{String(tick)}</output>
		<ul>
			@for (const row of rows; key row.id) {
				<li data-row={row.id}>
					<span>{row.read(suffix) as string}</span>
					<button onClick={() => onRows(rows.filter((current) => current.id !== row.id))}>
						Remove
					</button>
				</li>
			}
		</ul>
	</section>
}
