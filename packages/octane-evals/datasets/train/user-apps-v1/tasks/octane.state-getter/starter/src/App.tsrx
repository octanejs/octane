import { useState } from 'octane';

export function App(props: {
	onImmediate: (count: number) => void;
	schedule: (job: () => void) => void;
	onDeferred: (count: number) => void;
}) @{
	const [count, setCount] = useState(0);
	const incrementTwice = () => {
		setCount((value) => value + 1);
		setCount((value) => value + 1);
		props.onImmediate(count);
	};

	<section>
		<output aria-label="Current count">
			{count as string}
		</output>
		<button type="button" onClick={() => setCount((value) => value + 1)}>
			Increment
		</button>
		<button type="button" onClick={incrementTwice}>
			Increment twice
		</button>
		<button type="button" onClick={() => props.schedule(() => props.onDeferred(count))}>
			Report later
		</button>
	</section>
}
