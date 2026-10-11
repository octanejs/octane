function Child({ text }: { text: string }) @{
	<div>{text}</div>
}

export default function App() @{
	<Child text="123" />
}

export interface EntryParentProps {
	tick: number;
	onPick: () => void;
}

export function LocalParent(props: EntryParentProps) @{
	<main data-tick={String(props.tick)}>
		<strong>before</strong>
		<App />
		<em>after</em>
		<input aria-label="draft" defaultValue="seed" />
		<button onClick={props.onPick}>pick</button>
	</main>
}
