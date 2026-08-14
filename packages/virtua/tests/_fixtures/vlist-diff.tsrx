import { useRef, useState } from 'octane';
import { VList, type VListHandle } from '@octanejs/virtua';

const LARGE = Array.from({ length: 100 }, (_, id) => ({ id, label: `Item ${id}` }));
const SMALL = LARGE.slice(0, 8);

export function VListParity() @{
	const [items, setItems] = useState(LARGE);
	const listRef = useRef<VListHandle | null>(null);

	<div>
		<button id="swap-count" onClick={() => setItems(items.length === 8 ? LARGE : SMALL)}>
			swap
		</button>
		<VList
			ref={listRef}
			data={items}
			itemSize={50}
			keepMounted={[5]}
			style={{ height: 500, width: 100 }}
		>
			{(item: (typeof LARGE)[number], index: number) =>
				<div key={item.id} data-index={index}>{item.label}</div>}
		</VList>
	</div>
}
