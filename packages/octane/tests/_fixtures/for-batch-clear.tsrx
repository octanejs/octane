// Batch-clear disposal fixtures: keyed lists whose items carry teardown work
// in each of the shapes batchClearItems must reach — effect cleanups on a
// slot-stashed cross-module component (componentSlot lives on the item's
// `_slots`, not `.children`), a cleanup-returning callback ref on the item
// template itself, and a portal whose DOM lives in a foreign target.
import { use, useEffect, useState, createPortal } from '../../src/index.js';

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
const ownedItems: Item[] = [];
for (let i = 0; i < 1000; i++) ownedItems.push({ id: i + 10, label: 'row-' + i });

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

const rowRef = (_el: Element) => {
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

/** Large enough for owned-parent clear, but each row still needs ref teardown. */
export function LargeRefRows() @{
	const [items, setItems] = useState(ownedItems);
	<div>
		<button id="clear" onClick={() => setItems([])}>clear</button>
		<ul>
			@for (const item of items; key item.id) {
				<li ref={rowRef}>
					<span>{item.label}</span>
				</li>
			}
		</ul>
	</div>
}

/** The list is the only child of its parent, including while a root attempt suspends. */
export function OwnedParentRows({
	suspendOnClear,
	insertForeignOnClear,
	refillDuringClear,
	clearTwiceOnSuspend,
	reorderBeforeClearOnSuspend,
}: {
	suspendOnClear?: Promise<string>;
	insertForeignOnClear?: boolean;
	refillDuringClear?: boolean;
	clearTwiceOnSuspend?: boolean;
	reorderBeforeClearOnSuspend?: boolean;
}) @{
	const [items, setItems] = useState(ownedItems);
	const [pending, setPending] = useState(false);
	const [clearStage, setClearStage] = useState(0);
	<div>
		<button
			id="clear"
			onClick={() => {
				setItems(reorderBeforeClearOnSuspend ? ownedItems.toReversed() : []);
				if (suspendOnClear || insertForeignOnClear || refillDuringClear) setPending(true);
				if (clearTwiceOnSuspend) setClearStage(1);
				if (reorderBeforeClearOnSuspend) setClearStage(4);
			}}
		>clear</button>
		<button
			id="append"
			onClick={() => {
				setPending(false);
				setItems(items3b);
			}}
		>append</button>
		<button
			id="reverse"
			onClick={() => {
				setPending(false);
				setItems(ownedItems.toReversed());
			}}
		>reverse</button>
		<ul id="owned-list">
			@for (const item of items; key item.id) {
				<li class="row">
					<span>{item.label}</span>
					<i aria-hidden="true" />
				</li>
			}
		</ul>
		@{
			if (pending && suspendOnClear && !clearTwiceOnSuspend && !reorderBeforeClearOnSuspend) use(
				suspendOnClear,
			);
			if (pending && refillDuringClear && items.length === 0) setItems(items3b);
			if (clearTwiceOnSuspend) {
				if (clearStage === 1 && items.length === 0) {
					setItems(ownedItems.toReversed());
					setClearStage(2);
				} else if (clearStage === 2 && items.length === ownedItems.length) {
					setItems([]);
					setClearStage(3);
				} else if (clearStage === 3 && suspendOnClear) use(suspendOnClear);
			}
			if (reorderBeforeClearOnSuspend) {
				if (clearStage === 4) {
					setItems([]);
					setClearStage(5);
				} else if (clearStage === 5 && suspendOnClear) use(suspendOnClear);
			}
			if (pending && insertForeignOnClear) {
				const list = document.getElementById('owned-list')!;
				const foreign = document.createElement('li');
				foreign.id = 'foreign';
				foreign.textContent = 'external';
				list.insertBefore(foreign, list.lastChild);
			}
		}
	</div>
}

/** An empty branch is new DOM between the markers when the owned list clears. */
export function OwnedParentEmptyRows({ suspendOnClear }: { suspendOnClear?: Promise<string> }) @{
	const [items, setItems] = useState(ownedItems);
	const [pending, setPending] = useState(false);
	<div>
		<button
			id="clear"
			onClick={() => {
				setItems([]);
				setPending(true);
			}}
		>clear</button>
		<button
			id="append"
			onClick={() => {
				setPending(false);
				setItems(items3b);
			}}
		>append</button>
		<ul>
			@for (const item of items; key item.id) {
				<li class="row">
					<span>{item.label}</span>
				</li>
			} @empty {
				<li class="empty">No rows</li>
			}
		</ul>
		@{
			if (pending && suspendOnClear) use(suspendOnClear);
		}
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

/**
 * A keyed list SHARING its parent with interleaved JSX on both sides, so a
 * bulk clear may only take the span between the list's markers. `size` drives
 * the list across the point where the clear strategy changes.
 */
export function SharedParentRows({ size }: { size: number }) @{
	const initial: Item[] = [];
	for (let i = 1; i <= size; i++) initial.push({ id: i, label: 'row-' + i });
	const [items, setItems] = useState(initial);
	<div>
		<button id="clear" onClick={() => setItems([])}>clear</button>
		<ul>
			<li id="before">before</li>
			@for (const item of items; key item.id) {
				<li class="row">{item.label}</li>
			}
			<li id="after">after</li>
		</ul>
	</div>
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
