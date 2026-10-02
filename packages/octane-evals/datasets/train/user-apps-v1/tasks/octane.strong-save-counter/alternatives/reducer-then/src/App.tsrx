'use strong';
// Alternative: dispatch from the resolved promise through a reducer.
import { useReducer } from 'octane';

export function App({ save }: { save: () => Promise<void> }) @{
	const [saves, saved] = useReducer((count: number) => count + 1, 0);

	<section>
		<button onClick={() => void save().then(saved)}>{'Save'}</button>
		<p>{`Saved ${saves} times` as string}</p>
	</section>
}
