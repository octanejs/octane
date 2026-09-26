import { useState } from 'octane';
import { sharedLabel } from './shared.ts';

export function Live() @{
	const [count, setCount] = useState(0);
	<button
		onClick={async () => {
			const { increment } = await import('./later.ts');
			setCount(increment(count));
		}}
	>{`${sharedLabel}: ${count}`}</button>
}
