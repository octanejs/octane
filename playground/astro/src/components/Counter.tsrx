import { useState } from 'octane';

export function Counter(props: { start?: number }) @{
	const [count, setCount] = useState(props.start ?? 0);
	<>
		<button type="button" class="counter" data-testid="counter" onClick={() => setCount(count + 1)}>
			{'Count: ' + count}
		</button>
		<style>
			.counter {
				font: inherit;
				padding: 0.5rem 1rem;
				border-radius: 0.375rem;
				border: 1px solid #334155;
				background: #0f172a;
				color: #f8fafc;
				cursor: pointer;
			}
		</style>
	</>
}
