import { useState } from 'octane';

export function OrdinaryCounter(props: { label: string }) @{
	const [count, setCount] = useState(0);
	<main>
		<h1 id="label">{props.label}</h1>
		<input id="draft" aria-label="Draft" defaultValue="initial" />
		<button type="button" onClick={() => setCount((value) => value + 1)}>Increment</button>
		<output id="ordinary">{String(count)}</output>
	</main>
}
