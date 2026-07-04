import { createElement as h, useState } from 'octane';
import { bindSetData, initialData } from './ops.js';

// The EXACT dbmon workload of ../../octane-tsrx/src/App.tsrx (same data.js/ops.js,
// byte-identical rendered rows) authored in PLAIN .ts `createElement` — no .tsrx,
// no .tsx, no compiled templates. This is the shape every @octanejs binding
// produces, so the whole table renders through the runtime DE-OPT reconciler:
// the component's return value is a host descriptor tree that childSlot routes
// through reconcileDeoptNode/reconcileDeoptChildren (keyed row matching against
// the live DOM, per-prop diff loops via patchDeoptProps, DEOPT_DESC expando
// bookkeeping) instead of the template-clone + forBlock fast path.
//
// The only compiler involvement in this file is the vite plugin's hook-slotting
// pass, which appends the slot symbol to the `useState` call below — hooks need
// slots even in plain .ts. Descriptor construction and reconciliation are 100%
// runtime.

interface Query {
	elapsed: string;
	className: string;
}
interface Db {
	id: number;
	name: string;
	count: number;
	countClass: string;
	queries: Query[];
}

// One row descriptor: name cell + count cell + 5 query cells — mirrors the tuned
// fixture cell-for-cell (explicit queries[0..4], not a .map, to keep child shapes
// positional and the rendered bytes identical).
function row(db: Db) {
	return h(
		'tr',
		{ key: db.id },
		h('td', { className: 'dbname' }, db.name),
		h('td', { className: db.countClass }, db.count),
		h('td', { className: db.queries[0].className }, db.queries[0].elapsed),
		h('td', { className: db.queries[1].className }, db.queries[1].elapsed),
		h('td', { className: db.queries[2].className }, db.queries[2].elapsed),
		h('td', { className: db.queries[3].className }, db.queries[3].elapsed),
		h('td', { className: db.queries[4].className }, db.queries[4].elapsed),
	);
}

export default function App() {
	const [data, setData] = useState<Db[]>(initialData());
	bindSetData(setData);
	// Fresh descriptor tree EVERY render — the naive-authoring cost under test.
	return h(
		'table',
		{ className: 'dbmon' },
		h(
			'tbody',
			null,
			data.map((db) => row(db)),
		),
	);
}
