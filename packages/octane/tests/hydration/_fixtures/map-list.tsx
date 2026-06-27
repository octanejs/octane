import { useState } from 'octane';

// React-style `.tsx` `{items.map(x => <li key/>)}` keyed list. It lowers to the
// SAME forBlock fast path as `@for` on the client AND the equivalent ssrBlock
// path on the server, so the server markup carries matching block markers and
// the client adopts (not rebuilds) it on hydrateRoot.

let _reorder: (() => void) | null = null;
export function reorder() {
	if (_reorder) _reorder();
}

export function MapList() {
	const [items, setItems] = useState([
		{ id: 1, label: 'a' },
		{ id: 2, label: 'b' },
		{ id: 3, label: 'c' },
	]);
	// Move the last item to the front — a keyed reorder (the survivors keep their
	// DOM identity; only the moved node relocates).
	_reorder = () => setItems((d) => [d[2], d[0], d[1]]);
	return (
		<ul className="list">
			{items.map((x) => (
				<li className="row" data-id={x.id as number} key={x.id as number}>
					{x.label as string}
				</li>
			))}
		</ul>
	);
}
