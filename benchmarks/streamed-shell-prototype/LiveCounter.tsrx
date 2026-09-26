import { useState } from 'octane';
import { sharedLabel } from './shared.ts';

export function LiveCounter() @{
	const [count, setCount] = useState(0);
	<section aria-label="Live counter" data-counter>
		<p data-counter-label>{sharedLabel('counter') as string}</p>
		<output data-counter-value>{String(count)}</output>
		<button
			type="button"
			data-increment
			onClick={async () => {
				const { increment } = await import('./later.ts');
				setCount(increment(count));
			}}
		>Increment</button>
	</section>
}
