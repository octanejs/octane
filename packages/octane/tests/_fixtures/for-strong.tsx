/** @jsxImportSource octane */
'use strong';

import type { SnapshotListProps } from './for-strong.tsrx';

export function SnapshotMappedList({ items, prefix, onSelect }: SnapshotListProps) {
	return (
		<ul>
			{items.map((item) => (
				<li key={item.id} data-id={item.id}>
					<span className="snapshot-label">{item.read(prefix)}</span>
					<input defaultValue={item.label} />
					<button onClick={() => onSelect(item)}>select</button>
				</li>
			))}
		</ul>
	);
}
