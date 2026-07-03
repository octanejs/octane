import { useState } from 'octane';
import { actions, bindActions } from './actions.js';
import Row from './Row.tsrx';

// NAIVE-authoring twin of ../../octane-tsrx/src/Main.tsrx — the same app,
// same button ids and rendered rows, but written the way a React dev naturally
// writes it: each row is a cross-module <Row/> component (see ./Row.tsrx for
// the full list of tuned-path opt-outs). The DOM/button contract is identical,
// so ../../run.mjs and ../../run-reorder.mjs drive this fixture unchanged via
// the TARGETS env; the headline metric is the intra-octane naive/tuned ratio
// (see ../../README-naive.md).
//
// Data machinery (buildData, seeded shuffle) is copied verbatim from the tuned
// fixture so identical click sequences produce identical permutations.

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
function _random(max) {
	return Math.random() * max | 0;
}

function buildData(count) {
	const data = new Array(count);
	for (let i = 0; i < count; i++) {
		data[i] = {
			id: nextId++,
			label: ADJECTIVES[_random(ADJECTIVES.length)] + ' ' + COLOURS[_random(COLOURS.length)] + ' ' +
				NOUNS[_random(NOUNS.length)],
		};
	}
	return data;
}

// ── Deterministic shuffle machinery (identical in all bench fixtures, replayed
// by ../../run-reorder.mjs for its identity gate) ───────────────────────────
function mulberry32(seed) {
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
function shuffleWithSeed(d, seed) {
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

export default function Main() @{
	const [items, setItems] = useState([]);
	const [selected, setSelected] = useState(0);

	const run = () => setItems(buildData(1000));
	const runLots = () => setItems(buildData(10000));
	const add = () => setItems((d) => d.concat(buildData(1000)));
	const update = () => setItems((d) => {
		const out = d.slice();
		for (let i = 0; i < out.length; i += 10) {
			const r = out[i];
			out[i] = { id: r.id, label: r.label + ' !!!' };
		}
		return out;
	});
	const clear = () => setItems([]);
	const swap = () => setItems((d) => {
		if (d.length <= 998) return d;
		const out = d.slice();
		const tmp = out[1];
		out[1] = out[998];
		out[998] = tmp;
		return out;
	});
	const select = (id) => setSelected(id);
	const remove = (row) => setItems((d) => {
		const out = d.slice();
		out.splice(out.indexOf(row), 1);
		return out;
	});
	// Rows dispatch through the imported `actions` object (member-callee — the
	// naive handler shape); bind the real implementations each render.
	bindActions(select, remove);

	// Keyed-reorder matrix handlers — same ops as the tuned fixture so
	// ../../run-reorder.mjs can also drive this fixture via TARGETS.
	const reverseRows = () => setItems((d) => d.toReversed());
	const shuffleRows = () => {
		const seed = nextShuffleSeed();
		setItems((d) => shuffleWithSeed(d, seed));
	};
	const rotateForward = () =>
		setItems((d) => (d.length === 0 ? d : [d[d.length - 1], ...d.slice(0, -1)]));
	const rotateBackward = () => setItems((d) => (d.length === 0 ? d : [...d.slice(1), d[0]]));
	const prepend100 = () => setItems((d) => buildData(100).concat(d));
	const append100 = () => setItems((d) => d.concat(buildData(100)));
	const insertMid100 = () => setItems((d) => {
		const mid = d.length >> 1;
		return d.slice(0, mid).concat(buildData(100), d.slice(mid));
	});
	const removeFirst = () => setItems((d) => d.slice(1));
	const removeEvery10 = () => setItems((d) => d.filter((_, i) => i % 10 !== 0));
	const displace = (k) => setItems((d) => d.slice(k).concat(d.slice(0, k)));

	<div class="container">
		<div class="jumbotron">
			<div class="row">
				<div class="col-md-6">
					<h1>octane</h1>
				</div>
				<div class="col-md-6">
					<div class="row">
						<div class="col-sm-6 smallpad">
							<button type="button" class="btn btn-primary btn-block" id="run" onClick={run}>
								Create 1,000 rows
							</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button
								type="button"
								class="btn btn-primary btn-block"
								id="runlots"
								onClick={runLots}
							>Create 10,000 rows</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button type="button" class="btn btn-primary btn-block" id="add" onClick={add}>
								Append 1,000 rows
							</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button type="button" class="btn btn-primary btn-block" id="update" onClick={update}>
								Update every 10th row
							</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button type="button" class="btn btn-primary btn-block" id="clear" onClick={clear}>
								Clear
							</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button type="button" class="btn btn-primary btn-block" id="swaprows" onClick={swap}>
								Swap Rows
							</button>
						</div>
					</div>
					<div class="row">
						<div class="col-sm-6 smallpad">
							<button
								type="button"
								class="btn btn-primary btn-block"
								id="reverse"
								onClick={() => reverseRows()}
							>Reverse rows</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button
								type="button"
								class="btn btn-primary btn-block"
								id="shuffle"
								onClick={() => shuffleRows()}
							>Shuffle rows (seeded)</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button
								type="button"
								class="btn btn-primary btn-block"
								id="rotatef"
								onClick={() => rotateForward()}
							>Rotate last to front</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button
								type="button"
								class="btn btn-primary btn-block"
								id="rotateb"
								onClick={() => rotateBackward()}
							>Rotate first to end</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button
								type="button"
								class="btn btn-primary btn-block"
								id="prepend100"
								onClick={() => prepend100()}
							>Prepend 100 rows</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button
								type="button"
								class="btn btn-primary btn-block"
								id="append100"
								onClick={() => append100()}
							>Append 100 rows</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button
								type="button"
								class="btn btn-primary btn-block"
								id="insertmid100"
								onClick={() => insertMid100()}
							>Insert 100 rows at middle</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button
								type="button"
								class="btn btn-primary btn-block"
								id="removefirst"
								onClick={() => removeFirst()}
							>Remove first row</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button
								type="button"
								class="btn btn-primary btn-block"
								id="removeevery10"
								onClick={() => removeEvery10()}
							>Remove every 10th row</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button
								type="button"
								class="btn btn-primary btn-block"
								id="displace3"
								onClick={() => displace(3)}
							>Displace first 3 to end</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button
								type="button"
								class="btn btn-primary btn-block"
								id="displace4"
								onClick={() => displace(4)}
							>Displace first 4 to end</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button
								type="button"
								class="btn btn-primary btn-block"
								id="displace5"
								onClick={() => displace(5)}
							>Displace first 5 to end</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button
								type="button"
								class="btn btn-primary btn-block"
								id="displace6"
								onClick={() => displace(6)}
							>Displace first 6 to end</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button
								type="button"
								class="btn btn-primary btn-block"
								id="displace8"
								onClick={() => displace(8)}
							>Displace first 8 to end</button>
						</div>
					</div>
				</div>
			</div>
		</div>
		<table class="table table-hover table-striped test-data">
			<tbody>
				@for (const row of items; key row.id) {
					<Row
						item={row}
						selected={selected === row.id}
						onSelect={actions.select}
						onRemove={actions.remove}
					/>
				}
			</tbody>
		</table>
		<span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true" />
	</div>
}
