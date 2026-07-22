import { useRef, useState } from 'octane';

interface PackingItem {
	id: number;
	label: string;
	packed: boolean;
}

export function App() @{
	const [draft, setDraft] = useState('');
	const [items, setItems] = useState<PackingItem[]>([
		{ id: 1, label: 'Passport', packed: false },
	]);
	const nextId = useRef(2);

	const addItem = (event: Event) => {
		event.preventDefault();
		const label = draft.trim();
		if (label === '') return;
		setItems([...items, { id: nextId.current++, label, packed: false }]);
		setDraft('');
	};

	<main>
		<h1>{'Packing list'}</h1>
		<form aria-label="Add packing item" onSubmit={addItem}>
			<label for="packing-item">{'Packing item'}</label>
			<input
				id="packing-item"
				value={draft}
				onInput={(event: Event) => setDraft((event.target as HTMLInputElement).value)}
			/>
			<button type="submit">{'Add item'}</button>
		</form>

		<output aria-label="Packing summary">
			{items.filter((item) => !item.packed).length + ' unpacked'}
		</output>

		<ul>
			@for (const item of items; key item.id) {
				<li class={{ packed: item.packed }}>
					<span>{item.label as string}</span>
					<button
						aria-label={(item.packed ? 'Unpack ' : 'Pack ') + item.label}
						onClick={() => setItems(
							items.map(
								(candidate) => candidate.id === item.id
									? { ...candidate, packed: !candidate.packed }
									: candidate,
							),
						)}
					>
						{item.packed ? 'Unpack' : 'Pack'}
					</button>
					<button
						aria-label={'Remove ' + item.label}
						onClick={() => setItems(items.filter((candidate) => candidate.id !== item.id))}
					>{'Remove'}</button>
				</li>
			} @empty {
				<li>{'No items to pack'}</li>
			}
		</ul>
	</main>
}
