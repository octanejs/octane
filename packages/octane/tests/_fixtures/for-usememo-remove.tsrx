import { useMemo, useState } from 'octane';

// Playground #847 repro: https://octanejs.dev/playground#…App.tsrx
(globalThis as typeof globalThis & { i?: number }).i = 1;

export function ForUseMemoRemove() @{
	const [items, setItems] = useState([
		{ id: 1, label: 'apple' },
		{ id: 2, label: 'banana' },
		{ id: 3, label: 'cherry' },
	]);
	const [nextId, setNextId] = useState(4);

	const add = (position: 'start' | 'end') => {
		const item = { id: nextId, label: 'item ' + nextId };
		setNextId(nextId + 1);
		setItems(position === 'start' ? [item, ...items] : [...items, item]);
	};

	<div class="demo">
		<div class="row">
			<button onClick={() => add('start')}>{'Pre'}</button>
			<button onClick={() => add('end')}>{'App'}</button>
			<button onClick={() => setItems([...items].reverse())}>{'Rev'}</button>
			<button onClick={() => setItems([])}>{'Clear'}</button>
		</div>
		<ul>
			@for (const item of items; key item.id) {
				const m = useMemo(() => {
					return <li>
						{item.label as string}
						<button onClick={() => setItems(items.filter((x) => x.id !== item.id))}>
							{'remove ' + (globalThis as typeof globalThis & { i: number }).i++}
						</button>
					</li>;
				}, [item]);

				<>
					{m}
				</>
			} @empty {
				<li class="empty">{'Emptyy — add an item above.'}</li>
			}
		</ul>
	</div>
}
