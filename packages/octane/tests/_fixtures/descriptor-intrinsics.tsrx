import { useState } from 'octane';

function Mutator({ active, mutate }) {
	if (active) mutate();
	return null;
}

function List({ name, tick }) @{
	const [items, setItems] = useState([]);
	const visible = items.filter((item) => !item.completed);
	<section data-list={name} data-tick={tick}>
		<button
			onClick={() => setItems([
				{ label: 'first', completed: false },
				{ label: 'second', completed: true },
			])}
		>load</button>
		<output>{String(visible.length)}</output>
		@for (const item of visible; key item.label) {
			<span>{item.label}</span>
		}
	</section>
}

export function App({ tick, active, mutate }) @{
	<main>
		<List name="left" tick={tick} />
		<Mutator active={active} mutate={mutate} />
		<List name="right" tick={tick} />
	</main>
}
