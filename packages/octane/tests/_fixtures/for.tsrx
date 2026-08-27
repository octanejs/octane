import {
	Activity as ActivitySentinel,
	createContext,
	type OctaneNode,
	startTransition,
	use,
	useState,
} from 'octane';

export function List(props: { items: Array<{ id: number; label: string }> }) @{
	<ul>
		@for (const item of props.items; key item.id) {
			<li>{item.label as string}</li>
		}
	</ul>
}

// `@for (...) @empty { ... }` — empty branch mounts when the iterable is empty,
// unmounts when items return. Hooks declared in the empty body have their own
// Block boundary, so re-entering the empty state mounts a fresh state.
export function ListWithEmpty(props: { items: Array<{ id: number; label: string }> }) @{
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
export function setExternal(v: string) {
	EXTERNAL = v;
}

// A render-time call through a MEMBER callee defeats the survivor short-circuit
// entirely: `item.read()` reads mutable state through a STABLE item ref (the
// TanStack Table header pattern — `header.column.getIsSorted()` flips while the
// header object stays memoized), so compatibility mode re-runs the body on parent
// renders, like ordinary React without its compiler. Contrast DepPureList: a bare module-var READ stays
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

export function NestedConditionalCallBodyList() @{
	const [, setN] = useState(0);
	const [visible] = useState(true);
	<div>
		<button id="nested-call-rerender" onClick={() => setN((n) => n + 1)}>{'go'}</button>
		<ul>
			@for (const item of callItems; key item.id) {
				<li>
					@if (visible) {
						<span class="nested-call-row">{item.read()}</span>
					}
				</li>
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

export function NestedConditionalList(props: {
	items: Array<SelectionRow & { completed?: boolean }>;
	editing: number | null;
	prefix: string;
	onSelect: (id: number, prefix: string) => void;
}) @{
	const editing = props.editing;
	const prefix = props.prefix;
	const onSelect = props.onSelect;
	<ul id="nested-conditional-list">
		@for (const row of props.items; key row.id) {
			<li class={{ completed: row.completed, editing: editing === row.id }} data-prefix={prefix}>
				<button class="nested-conditional-action" onClick={() => onSelect(row.id, prefix)}>
					<span class="nested-conditional-label">{row.label as string}</span>
				</button>
				@if (editing === row.id) {
					<input class="nested-conditional-editor" defaultValue={row.label} />
				}
			</li>
		}
	</ul>
}

const Activity = ActivitySentinel as unknown as
	(props: {
		mode: 'hidden' | 'visible';
		children?: OctaneNode;
	}) => null;

let nestedConditionalActivityMode: 'hidden' | 'visible' = 'visible';

function readNestedConditionalActivityMode() {
	return nestedConditionalActivityMode;
}

export function setNestedConditionalActivityMode(mode: 'hidden' | 'visible') {
	nestedConditionalActivityMode = mode;
}

export function NestedConditionalActivityList(props: {
	items: SelectionRow[];
	visible: boolean;
}) @{
	const visible = props.visible;
	<ul id="nested-conditional-activity-list">
		@for (const row of props.items; key row.id) {
			<li>
				@if (visible) {
					<span class="nested-conditional-activity-label">{row.label as string}</span>
				}
				<Activity mode={readNestedConditionalActivityMode()}>
					<span class="nested-conditional-activity-content">{row.label as string}</span>
				</Activity>
			</li>
		}
	</ul>
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

export function KeyedSelectionProjectionList(props: {
	items: SelectionRow[];
	selected: number | null;
	projection: number;
}) @{
	const selected = props.selected;
	const projection = props.projection;
	<ul id="keyed-selection-projection-list">
		@for (const row of props.items; key row.id) {
			<li
				class={selected === row.id ? 'selected' : ''}
				data-projection={1 / projection}
			>{row.label as string}</li>
		}
	</ul>
}

export function KeyedSelectionControlledList(props: {
	items: SelectionRow[];
	selected: number | null;
}) @{
	const selected = props.selected;
	<ul id="keyed-selection-controlled-list">
		@for (const row of props.items; key row.id) {
			<li class={selected === row.id ? 'selected' : ''}>
				<input value={row.label} readOnly={true} />
			</li>
		}
	</ul>
}

export function KeyedSelectionRenderableList(props: {
	items: Array<{ id: number; content: OctaneNode }>;
	selected: number | null;
}) @{
	const selected = props.selected;
	<ul id="keyed-selection-renderable-list">
		@for (const row of props.items; key row.id) {
			<li class={selected === row.id ? 'selected' : ''}>{row.content}</li>
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

export function FastHostKeyedList(props: {
	items: SelectionRow[];
	selected: number | null;
	onPick: (id: number) => void;
}) @{
	const selected = props.selected;
	const onPick = props.onPick;
	<ul id="fast-host-keyed-list">
		<li class="fast-host-before">{'before'}</li>
		@for (const row of props.items; key row.id) {
			<li
				class={selected === row.id ? 'fast-host-row selected' : 'fast-host-row'}
				data-fast-host-id={row.id}
				onClick={() => onPick(row.id)}
			>{row.label as string}</li>
		}
		<li class="fast-host-after">{'after'}</li>
	</ul>
}

export function FastHostMappedList(props: {
	items: SelectionRow[];
	selected: number | null;
	onPick: (id: number) => void;
}) @{
	const selected = props.selected;
	const onPick = props.onPick;
	<ul id="fast-host-mapped-list">{props.items.map(
		(row) =>
			<li
				key={row.id}
				class={selected === row.id ? 'fast-host-mapped-row selected' : 'fast-host-mapped-row'}
				data-fast-host-id={row.id}
				onClick={() => onPick(row.id)}
			>{row.label as string}</li>,
	)}</ul>
}

export function FastHostCustomList(props: { items: SelectionRow[] }) @{
	<ul id="fast-host-custom-list">
		@for (const row of props.items; key row.id) {
			<li class="fast-host-custom-row">
				<div is="octane-fast-host-row">{row.label as string}</div>
			</li>
		}
	</ul>
}

export function FastHostRefList(props: {
	items: SelectionRow[];
	onRef: (element: HTMLLIElement | null) => void;
}) @{
	const onRef = props.onRef;
	<ul id="fast-host-ref-list">
		@for (const row of props.items; key row.id) {
			<li class="fast-host-ref-row" ref={onRef}>{row.label as string}</li>
		}
	</ul>
}

export function FastHostControlledList(props: { items: SelectionRow[] }) @{
	<div id="fast-host-controlled-list">
		@for (const row of props.items; key row.id) {
			<input class="fast-host-controlled-row" value={row.label} readOnly={true} />
		}
	</div>
}

export function FastHostRenderCallList(props: {
	items: Array<{ id: number; read: () => string }>;
}) @{
	<ul id="fast-host-render-call-list">
		@for (const row of props.items; key row.id) {
			<li class="fast-host-render-call-row">{row.read() as string}</li>
		}
	</ul>
}

function FastHostTransitionValue(props: { promise: Promise<string> }) @{
	const value = use(props.promise);
	<span id="fast-host-transition-value">{value as string}</span>
}

export function FastHostTransitionList(props: {
	items: SelectionRow[];
	initialPromise: Promise<string>;
	nextPromise: Promise<string>;
}) @{
	const [items, setItems] = useState([] as SelectionRow[]);
	const [resource, setResource] = useState(props.initialPromise);
	<div>
		<button
			id="fast-host-transition-fill"
			onClick={() => startTransition(() => {
				setItems(props.items);
				setResource(props.nextPromise);
			})}
		>{'fill'}</button>
		@try {
			<>
				<ul id="fast-host-transition-list">
					@for (const row of items; key row.id) {
						<li class="fast-host-transition-row">{row.label as string}</li>
					}
				</ul>
				<FastHostTransitionValue promise={resource} />
			</>
		} @pending {
			<span id="fast-host-transition-fallback">{'loading'}</span>
		}
	</div>
}

export const FastRowContext = createContext('outside');

export function FastContextGetterList(props: {
	items: Array<{ id: number; label: string }>;
	value: string;
}) @{
	<FastRowContext.Provider value={props.value}>
		<ul id="fast-context-getter-list">
			@for (const row of props.items; key row.id) {
				<li class="fast-context-getter-row">{row.label as string}</li>
			}
		</ul>
	</FastRowContext.Provider>
}

export function FastRenderableProbe(props: {
	onRender: (connectedRows: number, value: string) => void;
	onRef: (element: HTMLSpanElement | null) => void;
}) @{
	const value = use(FastRowContext);
	props.onRender(document.querySelectorAll('#fast-renderable-list > li').length, value);
	<span class="fast-renderable-probe" ref={props.onRef}>{value as string}</span>
}

export function FastMappedRenderableList(props: {
	items: Array<{ id: number; content: OctaneNode }>;
	value: string;
}) @{
	<FastRowContext.Provider value={props.value}>
		<ul id="fast-renderable-list">{props.items.map(
			(row) => <li class="fast-renderable-row" key={row.id}>{row.content}</li>,
		)}</ul>
	</FastRowContext.Provider>
}

export function FastMappedBoundaryList(props: {
	items: Array<{ id: number; content: OctaneNode }>;
	value: string;
}) @{
	@try {
		<FastMappedRenderableList items={props.items} value={props.value} />
	} @catch (error, reset) {
		<button
			id="fast-mapped-renderable-retry"
			onClick={reset}
		>{(error as Error).message as string}</button>
	}
}

export function FastSuspendingGetterList(props: {
	items: Array<{ id: number; label: string }>;
}) @{
	@try {
		<ul id="fast-suspending-getter-list">
			@for (const row of props.items; key row.id) {
				<li class="fast-suspending-getter-row">{row.label as string}</li>
			}
		</ul>
	} @pending {
		<span id="fast-suspending-getter-pending">{'loading'}</span>
	} @catch (error, reset) {
		<button
			id="fast-suspending-getter-retry"
			onClick={reset}
		>{(error as Error).message as string}</button>
	}
}

export function NestedConditionalTransition(props: {
	items: SelectionRow[];
	initialPromise: Promise<string>;
	nextPromise: Promise<string>;
}) @{
	const [prefix, setPrefix] = useState('initial');
	const [resource, setResource] = useState(props.initialPromise);
	<div>
		<button
			id="nested-transition-bump"
			onClick={() => startTransition(() => {
				setPrefix('pending');
				setResource(props.nextPromise);
			})}
		>{'update rows'}</button>
		<button
			id="nested-transition-urgent"
			onClick={() => setPrefix('urgent')}
		>{'update urgently'}</button>
		@try {
			<>
				<ul id="nested-transition-list">
					@for (const row of props.items; key row.id) {
						<li class={{ editing: row.id === 1 }} data-prefix={prefix}>
							<span class="nested-transition-label">{prefix + ':' + row.label}</span>
							@if (row.id === 1) {
								<strong class="nested-transition-detail">{prefix + ':' + row.label}</strong>
							}
						</li>
					}
				</ul>
				<SelectionTransitionValue promise={resource} />
			</>
		} @pending {
			<span id="nested-transition-fallback">{'loading'}</span>
		}
	</div>
}

interface NestedReorderGroup {
	id: number;
	label: string;
	rows: SelectionRow[];
}

export function NestedKeyedReorderList(props: {
	groups: NestedReorderGroup[];
	onPick: (groupId: number, rowId: number) => void;
}) @{
	const onPick = props.onPick;
	<section id="nested-keyed-reorder-list">
		@for (const group of props.groups; key group.id) {
			<article class="nested-reorder-group" data-reorder-group={group.id}>
				<h3>{group.label as string}</h3>
				<ul>
					@for (const row of group.rows; key row.id) {
						<li class="nested-reorder-row" data-reorder-row={row.id}>
							<button
								type="button"
								onClick={() => onPick(group.id, row.id)}
							>{row.label as string}</button>
						</li>
					}
				</ul>
			</article>
		}
	</section>
}

export function NestedKeyedReorderBoundary(props: {
	groups: NestedReorderGroup[];
	onPick: (groupId: number, rowId: number) => void;
}) @{
	@try {
		<NestedKeyedReorderList groups={props.groups} onPick={props.onPick} />
	} @pending {
		<span id="nested-reorder-pending">{'loading'}</span>
	} @catch (error, reset) {
		<button id="nested-reorder-retry" onClick={reset}>{(error as Error).message as string}</button>
	}
}

function NestedKeyedReorderValue(props: { promise: Promise<string> }) @{
	const value = use(props.promise);
	<span id="nested-reorder-transition-value">{value as string}</span>
}

export function NestedKeyedReorderTransition(props: {
	initialGroups: NestedReorderGroup[];
	nextGroups: NestedReorderGroup[];
	initialPromise: Promise<string>;
	nextPromise: Promise<string>;
	onPick: (groupId: number, rowId: number) => void;
}) @{
	const [groups, setGroups] = useState(props.initialGroups);
	const [resource, setResource] = useState(props.initialPromise);
	<div>
		<button
			id="nested-reorder-transition-start"
			onClick={() => startTransition(() => {
				setGroups(props.nextGroups);
				setResource(props.nextPromise);
			})}
		>{'reorder'}</button>
		<button
			id="nested-reorder-transition-urgent"
			onClick={() => setGroups(
				props.nextGroups.map(
					(group) => ({
						...group,
						rows: group.rows.map((row) => ({ ...row })),
					}),
				),
			)}
		>{'reorder urgently'}</button>
		@try {
			<>
				<NestedKeyedReorderList groups={groups} onPick={props.onPick} />
				<NestedKeyedReorderValue promise={resource} />
			</>
		} @pending {
			<span id="nested-reorder-transition-pending">{'loading'}</span>
		}
	</div>
}

interface HostBindingRow {
	id: number;
	className: string | string[];
	title: string;
	data: string;
	aria: string;
	hidden: boolean;
	only: OctaneNode;
	mixed: OctaneNode;
}

interface HostBindingListProps {
	items: HostBindingRow[];
	version: number;
	context: string;
}

export function HostBindingList(props: HostBindingListProps) @{
	const version = props.version;
	<FastRowContext.Provider value={props.context}>
		<ul>
			@for (const row of props.items; key row.id) {
				<li
					class={row.className}
					title={row.title}
					data-value={row.data as string}
					aria-label={row.aria}
					hidden={row.hidden}
					data-version={version}
				>
					<span data-kind="only">{row.only}</span>
					<span data-kind="mixed">
						<i>before</i>
						{row.mixed}
						<i>after</i>
					</span>
				</li>
			}
		</ul>
	</FastRowContext.Provider>
}

export function HostMappedBindingList(props: HostBindingListProps) @{
	const version = props.version;
	<FastRowContext.Provider value={props.context}>
		<ul>{props.items.map(
			(row) => <li
				key={row.id}
				class={row.className}
				title={row.title}
				data-value={row.data as string}
				aria-label={row.aria}
				hidden={row.hidden}
				data-version={version}
			>
				<span data-kind="only">{row.only}</span>
				<span data-kind="mixed">
					<i>before</i>
					{row.mixed}
					<i>after</i>
				</span>
			</li>,
		)}</ul>
	</FastRowContext.Provider>
}
