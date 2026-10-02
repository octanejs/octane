'use strong';
// Workaround: keep per-label counts in a module Map and force a render.
import { useState } from 'octane';

const counts = new Map<string, number>();

function Tally({ label }: { label: string }) @{
	const [, force] = useState(0);

	<button
		onClick={() => {
			counts.set(label, (counts.get(label) ?? 0) + 1);
			force(counts.get(label)!);
		}}
	>{`${label}: ${counts.get(label) ?? 0}` as string}</button>
}

export function App() @{
	<div>
		<Tally label="Apples" />
		<Tally label="Pears" />
	</div>
}
