'use strong';
import { useEffect, useRef, useState } from 'octane';

function Tab({
	label,
	selected,
	onSelect,
}: {
	label: string;
	selected: boolean;
	onSelect: () => void;
}) @{
	const button = useRef<HTMLButtonElement | null>(null);

	useEffect(() => {
		button.current!.classList.toggle('selected', selected);
	});

	<button ref={button} class="tab" onClick={onSelect}>{label as string}</button>
}

export function App() @{
	const [selected, setSelected] = useState('Overview');

	<nav>
		@for (const label of ['Overview', 'Activity', 'Settings']; key label) {
			<Tab label={label} selected={label === selected} onSelect={() => setSelected(label)} />
		}
	</nav>
}
