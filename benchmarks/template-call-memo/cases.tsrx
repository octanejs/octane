type Row = { readonly id: number; readonly label: string; read(suffix: string): string };
type Props = { rows: readonly Row[]; suffix: string; tick: number };
type PureCalls = {
	readonly computedMethod: 'format';
	format(value: string, suffix: string): string;
	useFormat(value: string, suffix: string): string;
	makeFormat(): (value: string, suffix: string) => string;
	map(values: readonly string[], project: (value: string) => string): string;
	tag(strings: TemplateStringsArray, value: string, suffix: string): string;
	Projector: new (value: string, suffix: string) => { readonly value: string };
};

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

export function AssumedPureRows({ rows, suffix, tick, calls }: Props & { calls: PureCalls }) @{
	<section>
		<output>{String(tick)}</output>
		<ul>
			@for (const row of rows; key row.id) {
				function useLocalFormat(value: string, nextSuffix: string) {
					return calls.format(value, nextSuffix);
				}
				<li data-row={row.id}>
					<span>{calls.useFormat(row.label, suffix) as string}</span>
					<span>{useLocalFormat(row.label, suffix) as string}</span>
					<span>{calls[calls.computedMethod](row.label, suffix) as string}</span>
					<span>{calls.makeFormat()(row.label, suffix) as string}</span>
					<span>{new calls.Projector(row.label, suffix).value as string}</span>
					<span>{calls.tag`${row.label}${':' + suffix}` as string}</span>
					<span>{calls.map([row.label], (value) => value + ':' + suffix) as string}</span>
				</li>
			}
		</ul>
	</section>
}
