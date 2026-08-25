import { useMemo, useState } from 'octane';

export function ForUseMemoRemove() @{
	const [items, setItems] = useState([
		{ id: 1, label: 'apple' },
		{ id: 2, label: 'banana' },
		{ id: 3, label: 'cherry' },
	]);
	<div class="demo">
		<div class="row">
			<button
				id="append"
				onClick={() => setItems([...items, { id: items.length + 1, label: 'new' }])}
			>{'append'}</button>
			<button id="reverse" onClick={() => setItems([...items].reverse())}>{'reverse'}</button>
		</div>
		<ul class="list">
			@for (const item of items; key item.id) {
				const row = useMemo(
					() => <li class="item" data-id={item.id}>
						<span class="label">{item.label as string}</span>
						<button
							class="remove"
							data-remove={item.id}
							onClick={() => setItems(items.filter((x) => x.id !== item.id))}
						>{'remove'}</button>
					</li>,
					[item],
				);
				<>
					{row}
				</>
			} @empty {
				<li class="empty">{'Empty — add an item above.'}</li>
			}
		</ul>
	</div>
}
