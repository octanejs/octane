import { SignalRow } from './ssr-signal-row.tsrx';

export function SignalRows(props: { rows: readonly { id: string; initial: string }[] }) @{
	<ul>
		@for (const row of props.rows; key row.id) {
			<SignalRow id={row.id} initial={row.initial} />
		}
	</ul>
}
