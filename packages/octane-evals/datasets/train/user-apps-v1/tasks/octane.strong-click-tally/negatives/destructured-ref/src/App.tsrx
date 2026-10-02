'use strong';
// Workaround: destructure the ref before rendering its value.
import { useRef, useState } from 'octane';

function Tally({ label }: { label: string }) @{
	const clicks = useRef(0);
	const [, force] = useState(0);
	const { current } = clicks;

	<button
		onClick={() => {
			clicks.current += 1;
			force(clicks.current);
		}}
	>
		{`${label}: ${current}` as string}
	</button>
}

export function App() @{
	<div>
		<Tally label="Apples" />
		<Tally label="Pears" />
	</div>
}
