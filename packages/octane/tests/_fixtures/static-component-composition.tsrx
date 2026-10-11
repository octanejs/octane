interface LabelProps {
	label: string;
}

function Label({ label }: LabelProps) @{
	<span data-label="true">{label as string}</span>
}

function Details(props: LabelProps) @{
	<div class="details">
		<Label label={props.label} />
		<em>tail</em>
	</div>
}

function Panel(props: LabelProps) @{
	<div class="panel">
		<Details label={props.label} />
	</div>
}

function Frame(props: LabelProps) @{
	<div class="frame">
		<Panel label={props.label} />
	</div>
}

function Card() @{
	<section class="card">
		<Frame label="fixed" />
	</section>
}

export interface CompositionProps {
	rows: readonly { id: number }[];
	tick: number;
	onPick: (id: number) => void;
}

export function App(props: CompositionProps) @{
	<main data-tick={String(props.tick)}>
		@for (const row of props.rows; key row.id) {
			<article data-row={String(row.id)}>
				<input aria-label="draft" defaultValue="seed" />
				<button onClick={() => props.onPick(row.id)}>select</button>
				<Card />
			</article>
		}
	</main>
}
