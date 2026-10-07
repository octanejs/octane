'use strong';
import { useState } from 'octane';

function Tab({
	label,
	selected,
	onSelect,
}: {
	label: string;
	selected: boolean;
	onSelect: () => void;
}) @{
	<button class={['tab', selected && 'selected']} onClick={onSelect}>
		{label as string}
	</button>
}

export function App() @{
	const [selected, setSelected] = useState('Overview');

	<nav>
		@for (const label of ['Overview', 'Activity', 'Settings']; key label) {
			<Tab label={label} selected={label === selected} onSelect={() => setSelected(label)} />
		}
	</nav>
}
