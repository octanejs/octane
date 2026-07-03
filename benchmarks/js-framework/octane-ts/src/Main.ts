import { createElement as h, useState } from 'octane';

// The js-framework app authored in PURE plain-.ts `createElement` — no .tsrx,
// no .tsx, no compiled templates, no compiler involvement for the rows at all.
// This is the exact shape every @octanejs binding produces, so the entire tree
// (jumbotron buttons AND the 1000-row table) is a fresh descriptor graph every
// render, reconciled by the runtime DE-OPT path (childSlot pure-host route →
// reconcileDeoptNode/reconcileDeoptChildren keyed matching + patchDeoptProps
// per-prop diff loops) instead of template clones + forBlock.
//
// Same DOM/button contract as ../octane-tsrx, so ../run.mjs and
// ../run-reorder.mjs drive this fixture unchanged via the TARGETS env. The only
// compiler touch on this file is the vite plugin's hook-slotting pass (the two
// `useState` calls below need per-call-site slot symbols even in plain .ts).
//
// Data machinery (buildData, seeded shuffle) is copied verbatim from the tuned
// fixture so identical click sequences produce identical permutations.

interface Item {
	id: number;
	label: string;
}

const ADJECTIVES = [
	'pretty',
	'large',
	'big',
	'small',
	'tall',
	'short',
	'long',
	'handsome',
	'plain',
	'quaint',
	'clean',
	'elegant',
	'easy',
	'angry',
	'crazy',
	'helpful',
	'mushy',
	'odd',
	'unsightly',
	'adorable',
	'important',
	'inexpensive',
	'cheap',
	'expensive',
	'fancy',
];
const COLOURS = [
	'red',
	'yellow',
	'blue',
	'green',
	'pink',
	'brown',
	'purple',
	'brown',
	'white',
	'black',
	'orange',
];
const NOUNS = [
	'table',
	'chair',
	'house',
	'bbq',
	'desk',
	'car',
	'pony',
	'cookie',
	'sandwich',
	'burger',
	'pizza',
	'mouse',
	'keyboard',
];

let nextId = 1;
function _random(max: number): number {
	return (Math.random() * max) | 0;
}

function buildData(count: number): Item[] {
	const data = new Array(count);
	for (let i = 0; i < count; i++) {
		data[i] = {
			id: nextId++,
			label:
				ADJECTIVES[_random(ADJECTIVES.length)] +
				' ' +
				COLOURS[_random(COLOURS.length)] +
				' ' +
				NOUNS[_random(NOUNS.length)],
		};
	}
	return data;
}

// ── Deterministic shuffle machinery (identical in all bench fixtures, replayed
// by ../run-reorder.mjs for its identity gate) ──────────────────────────────
function mulberry32(seed: number): () => number {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const SHUFFLE_SEED = 42;
const shuffleSeeds = mulberry32(SHUFFLE_SEED);
const nextShuffleSeed = () => (shuffleSeeds() * 4294967296) >>> 0;
function shuffleWithSeed(d: Item[], seed: number): Item[] {
	const rand = mulberry32(seed);
	const out = d.slice();
	for (let i = out.length - 1; i > 0; i--) {
		const j = (rand() * (i + 1)) | 0;
		const tmp = out[i];
		out[i] = out[j];
		out[j] = tmp;
	}
	return out;
}

// A jumbotron button descriptor — same markup as the tuned fixtures.
function button(id: string, label: string, onClick: () => void) {
	return h(
		'div',
		{ className: 'col-sm-6 smallpad' },
		h('button', { type: 'button', className: 'btn btn-primary btn-block', id, onClick }, label),
	);
}

// One row descriptor — cell-for-cell the tuned fixtures' markup, built with
// per-row closures over the current handlers (the binding-authored shape).
function row(item: Item, selectedId: number, select: (id: number) => void, remove: (row: Item) => void) {
	return h(
		'tr',
		{ key: item.id, className: selectedId === item.id ? 'danger' : '' },
		h('td', { className: 'col-md-1' }, item.id),
		h('td', { className: 'col-md-4' }, h('a', { onClick: () => select(item.id) }, item.label)),
		h(
			'td',
			{ className: 'col-md-1' },
			h(
				'a',
				{ onClick: () => remove(item) },
				h('span', { className: 'glyphicon glyphicon-remove', 'aria-hidden': 'true' }),
			),
		),
		h('td', {
			className: 'col-md-6',
			style: { fontWeight: selectedId === item.id ? 'bold' : 'normal' },
		}),
	);
}

export default function Main() {
	const [items, setItems] = useState<Item[]>([]);
	const [selected, setSelected] = useState(0);

	const run = () => setItems(buildData(1000));
	const runLots = () => setItems(buildData(10000));
	const add = () => setItems((d: Item[]) => d.concat(buildData(1000)));
	const update = () =>
		setItems((d: Item[]) => {
			const out = d.slice();
			for (let i = 0; i < out.length; i += 10) {
				const r = out[i];
				out[i] = { id: r.id, label: r.label + ' !!!' };
			}
			return out;
		});
	const clear = () => setItems([]);
	const swap = () =>
		setItems((d: Item[]) => {
			if (d.length <= 998) return d;
			const out = d.slice();
			const tmp = out[1];
			out[1] = out[998];
			out[998] = tmp;
			return out;
		});
	const select = (id: number) => setSelected(id);
	const remove = (r: Item) =>
		setItems((d: Item[]) => {
			const out = d.slice();
			out.splice(out.indexOf(r), 1);
			return out;
		});

	// Keyed-reorder matrix handlers — same ops as the tuned fixture so
	// ../run-reorder.mjs can also drive this fixture via TARGETS.
	const reverseRows = () => setItems((d: Item[]) => d.toReversed());
	const shuffleRows = () => {
		const seed = nextShuffleSeed();
		setItems((d: Item[]) => shuffleWithSeed(d, seed));
	};
	const rotateForward = () =>
		setItems((d: Item[]) => (d.length === 0 ? d : [d[d.length - 1], ...d.slice(0, -1)]));
	const rotateBackward = () =>
		setItems((d: Item[]) => (d.length === 0 ? d : [...d.slice(1), d[0]]));
	const prepend100 = () => setItems((d: Item[]) => buildData(100).concat(d));
	const append100 = () => setItems((d: Item[]) => d.concat(buildData(100)));
	const insertMid100 = () =>
		setItems((d: Item[]) => {
			const mid = d.length >> 1;
			return d.slice(0, mid).concat(buildData(100), d.slice(mid));
		});
	const removeFirst = () => setItems((d: Item[]) => d.slice(1));
	const removeEvery10 = () => setItems((d: Item[]) => d.filter((_, i) => i % 10 !== 0));
	const displace = (k: number) => setItems((d: Item[]) => d.slice(k).concat(d.slice(0, k)));

	return h(
		'div',
		{ className: 'container' },
		h(
			'div',
			{ className: 'jumbotron' },
			h(
				'div',
				{ className: 'row' },
				h('div', { className: 'col-md-6' }, h('h1', null, 'octane')),
				h(
					'div',
					{ className: 'col-md-6' },
					h(
						'div',
						{ className: 'row' },
						button('run', 'Create 1,000 rows', run),
						button('runlots', 'Create 10,000 rows', runLots),
						button('add', 'Append 1,000 rows', add),
						button('update', 'Update every 10th row', update),
						button('clear', 'Clear', clear),
						button('swaprows', 'Swap Rows', swap),
					),
					h(
						'div',
						{ className: 'row' },
						button('reverse', 'Reverse rows', () => reverseRows()),
						button('shuffle', 'Shuffle rows (seeded)', () => shuffleRows()),
						button('rotatef', 'Rotate last to front', () => rotateForward()),
						button('rotateb', 'Rotate first to end', () => rotateBackward()),
						button('prepend100', 'Prepend 100 rows', () => prepend100()),
						button('append100', 'Append 100 rows', () => append100()),
						button('insertmid100', 'Insert 100 rows at middle', () => insertMid100()),
						button('removefirst', 'Remove first row', () => removeFirst()),
						button('removeevery10', 'Remove every 10th row', () => removeEvery10()),
						button('displace3', 'Displace first 3 to end', () => displace(3)),
						button('displace4', 'Displace first 4 to end', () => displace(4)),
						button('displace5', 'Displace first 5 to end', () => displace(5)),
						button('displace6', 'Displace first 6 to end', () => displace(6)),
						button('displace8', 'Displace first 8 to end', () => displace(8)),
					),
				),
			),
		),
		h(
			'table',
			{ className: 'table table-hover table-striped test-data' },
			h(
				'tbody',
				null,
				items.map((r) => row(r, selected, select, remove)),
			),
		),
		h('span', { className: 'preloadicon glyphicon glyphicon-remove', 'aria-hidden': 'true' }),
	);
}
