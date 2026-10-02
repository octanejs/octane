'use strong';
import { useRef, useState } from 'octane';

function Tally({ label }: { label: string }) @{
	const clicks = useRef(0);
	const [, force] = useState(0);

	<button
		onClick={() => {
			clicks.current += 1;
			force(clicks.current);
		}}
	>{`${label}: ${clicks.current}` as string}</button>
}

export function App() @{
	<div>
		<Tally label="Apples" />
		<Tally label="Pears" />
	</div>
}
