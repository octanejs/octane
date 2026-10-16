import { useState } from 'octane';

export interface CounterProps {
	label: string;
	step: number;
	disabled: boolean;
}

export function Counter(props: CounterProps) @{
	const [count, setCount] = useState(0);
	<>
		<style>
			.counter {
				display: grid;
				gap: 1rem;
				max-width: 24rem;
				padding: 1.5rem;
				border-radius: 1rem;
				background: rgb(15, 23, 42);
				color: rgb(248, 250, 252);
				font-family: system-ui, sans-serif;
			}
			h2,
			p {
				margin: 0;
			}
			output {
				font-size: 2rem;
				font-weight: 700;
			}
			.counter-action {
				padding: 0.75rem 1rem;
				border: 0;
				border-radius: 0.5rem;
				background: rgb(37, 99, 235);
				color: white;
				font: inherit;
				cursor: pointer;
			}
			.counter-action:focus-visible {
				outline: 2px solid white;
				outline-offset: 3px;
			}
			.counter-action:disabled {
				opacity: 0.5;
				cursor: not-allowed;
			}
		</style>
		<section class="counter" aria-label="Octane counter">
			<h2>Native Octane counter</h2>
			<output aria-live="polite">{'Count: ' + count}</output>
			<p>{'Step: ' + props.step}</p>
			<button
				type="button"
				class="counter-action"
				disabled={props.disabled}
				onClick={() => setCount(count + props.step)}
			>
				{props.label}
			</button>
		</section>
	</>
}
