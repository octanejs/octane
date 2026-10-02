'use strong';
// Workaround: keep the count in a module object and force a render.
import { useState } from 'octane';

const tally = { clicks: 0 };

function Tally({ label }: { label: string }) @{
	const [, force] = useState(0);

	<button
		onClick={() => {
			tally.clicks += 1;
			force(tally.clicks);
		}}
	>
		{`${label}: ${tally.clicks}` as string}
	</button>
}

export function App() @{
	<div>
		<Tally label="Apples" />
		<Tally label="Pears" />
	</div>
}
