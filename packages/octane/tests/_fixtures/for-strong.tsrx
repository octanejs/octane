'use strong';

import { createContext, useContext, useState } from 'octane';

export interface SnapshotRow {
	id: number;
	label: string;
	read(prefix: string): string;
}

export interface SnapshotListProps {
	items: SnapshotRow[];
	prefix: string;
	onSelect: (item: SnapshotRow) => void;
}

interface SnapshotCalculationProps {
	item: SnapshotRow;
	prefix: string;
	formatter: { read(item: SnapshotRow, prefix: string): string };
}

function readSnapshot({ formatter, item, prefix }: SnapshotCalculationProps) {
	return formatter.read(item, prefix);
}

export function SnapshotCalculation({ formatter, item, prefix }: SnapshotCalculationProps) @{
	const label = formatter.read(item, prefix);
	<p>{label as string}</p>
}

export function WrappedSnapshotCalculation(props: SnapshotCalculationProps) @{
	const label = readSnapshot(props);
	<p>{label as string}</p>
}

export function SnapshotMethodList({ items, prefix, onSelect }: SnapshotListProps) @{
	<ul>
		@for (const item of items; key item.id) {
			<li data-id={item.id}>
				<span class="snapshot-label">{item.read(prefix) as string}</span>
				<input defaultValue={item.label} />
				<button onClick={() => onSelect(item)}>select</button>
			</li>
		} @empty {
			<li class="snapshot-empty">{prefix + 'empty'}</li>
		}
	</ul>
}

// Keep the reported callback shape: it deliberately closes over this render's
// items snapshot, so an append must refresh handlers on surviving rows.
export function CapturedSnapshotList() @{
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
	<div>
		<button id="captured-prepend" onClick={() => add('start')}>prepend</button>
		<button id="captured-append" onClick={() => add('end')}>append</button>
		<button id="captured-reverse" onClick={() => setItems([...items].reverse())}>reverse</button>
		<button id="captured-clear" onClick={() => setItems([])}>clear</button>
		<ul>
			@for (const item of items; key item.id) {
				<li class="captured-row" data-id={item.id}>
					<span>{item.label as string}</span>
					{console.log('eval:', item.id)}
					<button onClick={() => setItems(items.filter((entry) => entry.id !== item.id))}>
						remove
					</button>
				</li>
			} @empty {
				<li class="captured-empty">Empty</li>
			}
		</ul>
	</div>
}

const PrefixContext = createContext('initial:');

export function ContextArgumentMethodList({ items, prefix }: Omit<SnapshotListProps, 'onSelect'>) @{
	<PrefixContext.Provider value={prefix}>
		<ul>
			@for (const item of items; key item.id) {
				<li>{item.read(useContext(PrefixContext)) as string}</li>
			}
		</ul>
	</PrefixContext.Provider>
}

export function RefMethodList({
	items,
}: {
	items: Array<{ id: number; current: { read(): string } }>;
}) @{
	<ul>
		@for (const item of items; key item.id) {
			<li>{item.current.read() as string}</li>
		}
	</ul>
}
