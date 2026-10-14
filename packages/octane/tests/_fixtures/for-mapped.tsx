/** @jsxImportSource octane */
// The compatibility `.map()` counterpart of the Strong `@for` lists in
// for-strong.tsrx. Strong mode does not compile `.tsx`.
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
