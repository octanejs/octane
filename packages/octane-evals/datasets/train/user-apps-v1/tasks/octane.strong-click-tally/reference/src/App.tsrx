'use strong';
import { useState } from 'octane';

function Tally({ label }: { label: string }) @{
	const [clicks, setClicks] = useState(0);

	<button onClick={() => setClicks(clicks + 1)}>{`${label}: ${clicks}` as string}</button>
}

export function App() @{
	<div>
		<Tally label="Apples" />
		<Tally label="Pears" />
	</div>
}
