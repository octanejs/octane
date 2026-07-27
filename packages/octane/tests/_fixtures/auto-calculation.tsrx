import { useState } from 'octane';
import { projectRows, tagged } from './auto-calculation-helpers.ts';

// Fixtures for auto-calculation memoization: a derived `const` whose init
// reaches a render-time call is cached on its component-local inputs, so its
// identity is stable while those inputs are.

// --- identity stability ----------------------------------------------------

// `derived` is rebuilt only when `items` changes. The probe renders the
// identity itself so a test can observe stability without asserting on
// internals: a fresh array means a fresh label.
let identityCounter = 0;
const identities = new WeakMap<object, number>();
function identityOf(value: object): string {
	let id = identities.get(value);
	if (id === undefined) {
		id = ++identityCounter;
		identities.set(value, id);
	}
	return 'id' + id;
}
export function resetIdentities() {
	identityCounter = 0;
}

export function DerivedIdentity() @{
	const [items, setItems] = useState([
		{ id: 1, n: 1 },
	]);
	const [tick, setTick] = useState(0);
	const visible = projectRows(items);
	<div>
		<button id="di-tick" onClick={() => setTick(tick + 1)}>{'tick'}</button>
		<button
			id="di-add"
			onClick={() => setItems([...items, { id: items.length + 1, n: items.length + 1 }])}
		>{'add'}</button>
		<span id="di-identity">{identityOf(visible)}</span>
		<span id="di-count">{'' + visible.length}</span>
		<span id="di-tickval">{'' + tick}</span>
	</div>
}

// --- correctness of the cached value ---------------------------------------

export function DerivedValue() @{
	const [rows, setRows] = useState([
		{ id: 1, n: 1 },
		{ id: 2, n: 2 },
	]);
	const [tick, setTick] = useState(0);
	const total = rows.reduce((sum, r) => sum + r.n, 0);
	const labels = projectRows(rows);
	<div>
		<button id="dv-tick" onClick={() => setTick(tick + 1)}>{'tick'}</button>
		<button
			id="dv-bump"
			onClick={() => setRows(rows.map((r) => (r.id === 1 ? { ...r, n: r.n + 10 } : r)))}
		>{'bump'}</button>
		<span id="dv-total">{'' + total}</span>
		<span id="dv-labels">{labels.join(',')}</span>
		<span id="dv-tickval">{'' + tick}</span>
	</div>
}

// --- hook calls are never wrapped ------------------------------------------
//
// A cache around a hook call freezes its state cell and any subscription it
// owns. These two shapes both LOOK like ordinary creations to a purely
// syntactic creation check: the callee is a plain identifier and the call is
// reached during render. Only the naming convention distinguishes them.

function useCounterState(): { value: number; bump: () => void } {
	const [value, setValue] = useState(0);
	return { value, bump: () => setValue(value + 1) };
}

// React's staging prefix, mirrored by bindings (@octanejs/remix-router ships
// `unstable_useRouterState`). Still a hook.
function unstable_useLabelState(): { label: string; set: () => void } {
	const [label, setLabel] = useState('a');
	return { label, set: () => setLabel('b') };
}

export function HookCallDeclarations() @{
	const counter = useCounterState();
	const labelled = unstable_useLabelState();
	const [tick, setTick] = useState(0);
	<div>
		<button id="hc-tick" onClick={() => setTick(tick + 1)}>{'tick'}</button>
		<button id="hc-bump" onClick={counter.bump}>{'bump'}</button>
		<button id="hc-label" onClick={labelled.set}>{'label'}</button>
		<span id="hc-count">{'' + counter.value}</span>
		<span id="hc-label-value">{labelled.label}</span>
		<span id="hc-tickval">{'' + tick}</span>
	</div>
}

// --- shapes that must keep recomputing -------------------------------------

// A `let` can be reassigned, so caching its initializer would drop the
// reassignment. It must keep evaluating every render.
export function ReassignedLocal() @{
	const [tick, setTick] = useState(0);
	let label = tagged('base');
	if (tick > 0) label = tagged('changed');
	<div>
		<button id="rl-tick" onClick={() => setTick(tick + 1)}>{'tick'}</button>
		<span id="rl-label">{label}</span>
	</div>
}

// A calculation reached only by an event handler — never read by the render
// tree — should not acquire a cache it cannot pay for. Behaviorally it must
// simply keep working.
export function HandlerOnlyCalculation() @{
	const [rows, setRows] = useState([
		{ id: 1, n: 1 },
	]);
	const [seen, setSeen] = useState('none');
	const summary = projectRows(rows).join('|');
	<div>
		<button id="ho-read" onClick={() => setSeen(summary)}>{'read'}</button>
		<button
			id="ho-bump"
			onClick={() => setRows([...rows, { id: rows.length + 1, n: rows.length + 1 }])}
		>{'bump'}</button>
		<span id="ho-seen">{seen}</span>
	</div>
}

// --- a member call on a live receiver is never cached -----------------------
//
// The receiver hazard: a stable object whose method returns a different answer
// each time it is asked. `virtualizer.getVirtualItems()` in examples/pulseboard
// is this shape — the window moves with scroll while the virtualizer instance
// stays put — and caching it froze a virtualized list mid-scroll.
function createSource() {
	let n = 0;
	return {
		read() {
			n += 1;
			return 'n' + n;
		},
	};
}

export function LiveReceiverCalculation() @{
	// Held in state so its identity is stable across renders — exactly the
	// condition that makes a cache keyed on it freeze.
	const [source] = useState(createSource);
	const [tick, setTick] = useState(0);
	const reading = source.read();
	<div>
		<button id="lr-tick" onClick={() => setTick(tick + 1)}>{'tick'}</button>
		<span id="lr-reading">{reading}</span>
		<span id="lr-tickval">{'' + tick}</span>
	</div>
}
