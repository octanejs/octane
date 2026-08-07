import { startTransition, use, useState } from 'octane';

export function List(props) @{
	<ul>
		@for (const item of props.items; key item.id) {
			<li>{item.label as string}</li>
		}
	</ul>
}

// `@for (...) @empty { ... }` — empty branch mounts when the iterable is empty,
// unmounts when items return. Hooks declared in the empty body have their own
// Block boundary, so re-entering the empty state mounts a fresh state.
export function ListWithEmpty(props) @{
	<ul class="outer">
		@for (const item of props.items; key item.id) {
			<li class="row">{item.label as string}</li>
		} @empty {
			<li class="empty">{'No items'}</li>
		}
	</ul>
}

// Toggle items in/out via state — exercises the items → 0 → items transition
// the runtime needs to handle.
export function ToggleableEmpty() @{
	const [items, setItems] = useState([
		{ id: 1, label: 'a' },
		{ id: 2, label: 'b' },
	]);
	<div>
		<button id="clear" onClick={() => setItems([])}>{'clear'}</button>
		<button
			id="restore"
			onClick={() => setItems([
				{ id: 1, label: 'a' },
				{ id: 2, label: 'b' },
			])}
		>{'restore'}</button>
		<ul class="outer">
			@for (const item of items; key item.id) {
				<li class="row">{item.label as string}</li>
			} @empty {
				<li class="empty">{'No items'}</li>
			}
		</ul>
	</div>
}

export function MutableList() @{
	const [items, setItems] = useState([
		{ id: 1, label: 'a' },
		{ id: 2, label: 'b' },
		{ id: 3, label: 'c' },
	]);
	<div>
		<button id="reverse" onClick={() => setItems([...items].reverse())}>{'rev'}</button>
		<button
			id="swap"
			onClick={() => {
				const next = [...items];
				const tmp = next[0];
				next[0] = next[next.length - 1];
				next[next.length - 1] = tmp;
				setItems(next);
			}}
		>{'swap'}</button>
		<button
			id="add"
			onClick={() => setItems([
				...items,
				{ id: items.length + 1, label: String.fromCharCode(97 + items.length) },
			])}
		>{'add'}</button>
		<button id="remove-first" onClick={() => setItems(items.slice(1))}>{'rm-first'}</button>
		<button
			id="remove-middle"
			onClick={() => {
				const next = [...items];
				next.splice(Math.floor(next.length / 2), 1);
				setItems(next);
			}}
		>{'rm-mid'}</button>
		<button id="clear" onClick={() => setItems([])}>{'clear'}</button>
		<ul>
			@for (const item of items; key item.id) {
				<li>{item.label as string}</li>
			}
		</ul>
	</div>
}

// DEP-PURE @for with a possibly-NaN dep. The body closes over `marker` (a component
// local → the compiler emits `[marker]` as the forBlock deps array, flags bit 4) and
// reads the module-level EXTERNAL (mutable, NOT a dep — module vars don't affect the
// purity analysis). The reconciler's depsEqual must compare with Object.is so a NaN
// dep still promotes stable survivors to pure — the test observes the promotion via
// EXTERNAL: a promoted (skipped) body never re-reads it.
let EXTERNAL = 'tick0';
export function setExternal(v) {
	EXTERNAL = v;
}

// A render-time call through a MEMBER callee defeats the survivor short-circuit
// entirely: `item.read()` reads mutable state through a STABLE item ref (the
// TanStack Table header pattern — `header.column.getIsSorted()` flips while the
// header object stays memoized), so the body must re-run on every parent render,
// React-parity. Contrast DepPureList below: a bare module-var READ stays
// eligible (documented at-your-own-risk), and so does a call through a plain
// identifier callee (PlainCalleeList) — the receiver is what carries the hazard.
const callItems = [
	{ id: 1, read: () => 'r1:' + EXTERNAL },
	{ id: 2, read: () => 'r2:' + EXTERNAL },
];

export function CallBodyList() @{
	const [, setN] = useState(0);
	<div>
		<button id="cb-rerender" onClick={() => setN((n) => n + 1)}>{'go'}</button>
		<ul>
			@for (const item of callItems; key item.id) {
				<li class="cb-row">{item.read()}</li>
			}
		</ul>
	</div>
}

export function DepPureList() @{
	const [marker, setMarker] = useState(0);
	const [items] = useState([{ id: 1 }, { id: 2 }]);
	const [, setN] = useState(0);
	<div>
		<button id="nanify" onClick={() => setMarker(NaN)}>{'nan'}</button>
		<button id="rerender" onClick={() => setN((n) => n + 1)}>{'go'}</button>
		<ul>
			@for (const item of items; key item.id) {
				<li class="dp-row" data-m={marker}>{'row' + item.id + ':' + EXTERNAL}</li>
			}
		</ul>
	</div>
}

// A call through a PLAIN IDENTIFIER callee is an ordinary value projection —
// the shape of every `{formatPrice(cents)}` / `{t('key')}` in real code. It does
// NOT defeat memoization (contrast CallBodyList's member callee), so the region
// tracks its real dependencies: a changed item value must still reach the DOM.
function fmtRow(item: { id: number; value: number }) {
	return 'p' + item.id + ':' + item.value;
}

export function PlainCalleeList() @{
	const [items, setItems] = useState([
		{ id: 1, value: 0 },
		{ id: 2, value: 0 },
	]);
	const [, setN] = useState(0);
	<div>
		<button id="pc-rerender" onClick={() => setN((n) => n + 1)}>{'go'}</button>
		<button
			id="pc-bump"
			onClick={() => setItems(
				(prev) => prev.map((it) => (it.id === 1 ? { ...it, value: it.value + 1 } : it)),
			)}
		>{'bump'}</button>
		<ul>
			@for (const item of items; key item.id) {
				<li class="pc-row">{fmtRow(item)}</li>
			}
		</ul>
	</div>
}

interface SelectionRow {
	id: number;
	label: string;
}

export function KeyedSelectionList(props: {
	items: SelectionRow[];
	selected: number | null;
	prefix?: string;
}) @{
	const selected = props.selected;
	const prefix = props.prefix ?? 'row';
	<ul id="keyed-selection-list">
		@for (const row of props.items; key row.id) {
			<li
				class={selected === row.id ? 'selected' : ''}
				data-prefix={prefix}
			>{row.label as string}</li>
		}
	</ul>
}

export function KeyedSelectionUuidList(props: {
	items: Array<{ uuid: string; label: string }>;
	selected: string | null;
}) @{
	const selected = props.selected;
	<ul id="keyed-selection-uuid-list">
		@for (const row of props.items; key row.uuid) {
			<li class={row.uuid === selected ? 'selected' : ''}>{row.label as string}</li>
		}
	</ul>
}

export function MismatchedKeyedSelectionList(props: {
	items: Array<{ uuid: string; id: string; label: string }>;
	selected: string | null;
}) @{
	const selected = props.selected;
	<ul id="mismatched-keyed-selection-list">
		@for (const row of props.items; key row.uuid) {
			<li class={selected === row.id ? 'selected' : ''}>{row.label as string}</li>
		}
	</ul>
}

export function SharedKeyedSelectionList(props: {
	items: SelectionRow[];
	selected: number | null;
}) @{
	const selected = props.selected;
	<ul id="shared-keyed-selection-list">
		@for (const row of props.items; key row.id) {
			<li
				class={selected === row.id ? 'selected' : ''}
				data-selected={selected}
			>{row.label as string}</li>
		}
	</ul>
}

function SelectionTransitionValue(props: { promise: Promise<string> }) @{
	const value = use(props.promise);
	<span id="selection-transition-value">{value as string}</span>
}

export function KeyedSelectionTransition(props: {
	items: SelectionRow[];
	initialPromise: Promise<string>;
	nextPromise: Promise<string>;
}) @{
	const [selected, setSelected] = useState(1);
	const [resource, setResource] = useState(props.initialPromise);
	<div>
		<button
			id="selection-transition-bump"
			onClick={() => startTransition(() => {
				setSelected(2);
				setResource(props.nextPromise);
			})}
		>{'select next'}</button>
		<button
			id="selection-transition-urgent"
			onClick={() => setSelected(3)}
		>{'select urgently'}</button>
		@try {
			<>
				<ul id="selection-transition-list">
					@for (const row of props.items; key row.id) {
						<li class={selected === row.id ? 'selected' : ''}>{row.label as string}</li>
					}
				</ul>
				<SelectionTransitionValue promise={resource} />
			</>
		} @pending {
			<span id="selection-transition-fallback">{'loading'}</span>
		}
	</div>
}
