// Batch-clear disposal fixtures: keyed lists whose items carry teardown work
// in each of the shapes batchClearItems must reach — effect cleanups on a
// slot-stashed cross-module component (componentSlot lives on the item's
// `_slots`, not `.children`), a cleanup-returning callback ref on the item
// template itself, and a portal whose DOM lives in a foreign target.
import { useEffect, useState, createPortal } from '../../src/index.js';

export const log: string[] = [];
export const resetLog = () => {
	log.length = 0;
};

interface Item {
	id: number;
	label: string;
}

const items3: Item[] = [
	{ id: 1, label: 'a' },
	{ id: 2, label: 'b' },
	{ id: 3, label: 'c' },
];
const items3b: Item[] = [
	{ id: 4, label: 'd' },
	{ id: 5, label: 'e' },
	{ id: 6, label: 'f' },
];

function Row({ item }: { item: Item }) @{
	useEffect(() => {
		log.push(`mount:${item.id}`);
		return () => {
			log.push(`cleanup:${item.id}`);
		};
	}, [item.id]);
	<li>{item.label}</li>
}

/** Cross-module component rows (componentSlot stashed on item `_slots`). */
export function ComponentRows() @{
	const [items, setItems] = useState(items3);
	<div>
		<button id="clear" onClick={() => setItems([])}>clear</button>
		<button id="replace" onClick={() => setItems(items3b)}>replace</button>
		<ul>
			@for (const item of items; key item.id) {
				<Row item={item} />
			}
		</ul>
	</div>
}

const rowRef = (el: Element) => {
	log.push('ref:attach');
	return () => {
		log.push('ref:cleanup');
	};
};

/** Ref-only rows: no effects anywhere — teardown work is ONLY the ref cleanup. */
export function RefRows() @{
	const [items, setItems] = useState(items3);
	<div>
		<button id="clear" onClick={() => setItems([])}>clear</button>
		<ul>
			@for (const item of items; key item.id) {
				<li ref={rowRef}>{item.label}</li>
			}
		</ul>
	</div>
}

function PortalRow({ item, target }: { item: Item; target: Element }) @{
	<li>
		{item.label}
		{createPortal(
			() => @{
				<span class="tip">{'tip-' + item.label}</span>
			},
			target,
		)}
	</li>
}

/** Portal-carrying rows: item content in a FOREIGN target must self-detach. */
export function PortalRows({ target }: { target: Element }) @{
	const [items, setItems] = useState(items3);
	<div>
		<button id="clear" onClick={() => setItems([])}>clear</button>
		<ul>
			@for (const item of items; key item.id) {
				<PortalRow item={item} target={target} />
			}
		</ul>
	</div>
}
