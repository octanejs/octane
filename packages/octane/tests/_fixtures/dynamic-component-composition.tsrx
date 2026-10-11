interface LabelProps {
	label: string;
}

function Label({ label }: LabelProps) @{
	<span data-dynamic-label="true" title={label}>
		before{label as string}after
	</span>
}

function Details({ label }: LabelProps) @{
	<div class="details">
		<Label label={label} />
	</div>
}

function Panel({ label }: LabelProps) @{
	<div class="panel">
		<Details label={label} />
	</div>
}

function Frame({ label }: LabelProps) @{
	<div class="frame">
		<Panel label={label} />
	</div>
}

function Entry({ label }: LabelProps) @{
	<section class="entry">
		<Frame label={label} />
	</section>
}

export interface DynamicCompositionProps {
	rows: readonly { id: number; label: string }[];
	tick: number;
	onPick: (id: number, label: string) => void;
}

export function App(props: DynamicCompositionProps) @{
	<main data-tick={String(props.tick)}>
		@for (const row of props.rows; key row.id) {
			<article data-row={String(row.id)}>
				<input aria-label="draft" defaultValue="seed" />
				<button onClick={() => props.onPick(row.id, row.label)}>select</button>
				<Entry label={`${row.label}`} />
			</article>
		}
	</main>
}

export function Toggle(props: DynamicCompositionProps & { visible: boolean }) @{
	<div class="toggle">
		@if (props.visible) {
			<App rows={props.rows} tick={props.tick} onPick={props.onPick} />
		} @else {
			<em>hidden</em>
		}
	</div>
}
