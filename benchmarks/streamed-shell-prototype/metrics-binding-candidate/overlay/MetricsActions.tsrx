export type MetricsActionsProps = {
	scenario: string;
	waves: string;
	turns: string;
	historyRows: string;
	href: string;
	run: string;
	exportState: string;
	onExport: () => void;
};

// The same presentation is compiled for SSR, ordinary activation and bindings.
export function MetricsActions(props: MetricsActionsProps) @{
	'use dom bindings';
	<div class="capture-actions">
		<p>
			Current run:
			{props.scenario as string}
			·
			{props.waves as string}
			snapshots ·
			{props.turns as string}
			turns ·
			{props.historyRows as string}
			history rows
		</p>
		<button type="button" onClick={props.onExport}>Export browser trace</button>
		<output>{props.exportState as string}</output>
		<a href={props.href} target="_blank" rel="noreferrer">Producer trace ↗</a>
		<small>
			Run
			<code>{props.run as string}</code>
		</small>
	</div>
}
