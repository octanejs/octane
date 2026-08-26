/** @jsxImportSource octane */
'use strong';

import { createContext, useContext, useState } from 'octane';
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

const MapMethodContext = createContext('initial');
const mapMethod = 'readMapContext';

export function ComputedHookMappedRows({ value }: { value: string }) {
	const [contextMapRows] = useState(() => [
		{
			id: 1,
			[mapMethod]() {
				return useContext(MapMethodContext);
			},
		},
	]);
	return (
		<MapMethodContext.Provider value={value}>
			<ul>
				{contextMapRows.map((contextMapRow) => (
					<li key={contextMapRow.id}>{contextMapRow.readMapContext()}</li>
				))}
			</ul>
		</MapMethodContext.Provider>
	);
}
