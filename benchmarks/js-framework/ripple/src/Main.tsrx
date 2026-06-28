import { track, flushSync, type Tracked } from 'ripple';

// Keyed Ripple implementation, ported from js-framework-benchmark
// frameworks/keyed/ripple to current ripple syntax: `function … @{}` (was
// `component … {}`), `@for (…; key row.id)` (was a plain `for` over `items.value`),
// `{expr}` (was `{text expr}`), and a `let &[…] = track()` reactive proxy for the
// list/selection. Per-row `label` stays a `Tracked<string>` so the `update` op
// mutates each tenth label in place (`row.label.value += …`) — the fine-grained
// write ripple is built for, no list reconcile.
//
// Each handler is wrapped in `flushSync` so the mutation commits synchronously
// inside the discrete click (ripple otherwise batches + flushes on a microtask).
// The run.mjs harness times only the synchronous click handler — same adaptation
// react uses here, and the dbmon ripple app makes via `flushSync(op)`.

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

interface Row {
	id: number;
	label: Tracked<string>;
}

let rowId = 1;
function _random(max: number) {
	return Math.round(Math.random() * 1000) % max | 0;
}
function buildData(count: number): Row[] {
	const data = new Array(count);
	for (let i = 0; i < count; i++) {
		data[i] = {
			id: rowId++,
			label: track(
				`${ADJECTIVES[_random(ADJECTIVES.length)]} ${COLOURS[_random(
					COLOURS.length,
				)]} ${NOUNS[_random(NOUNS.length)]}`,
			),
		};
	}
	return data;
}

export default function App() @{
	let &[items] = track<Row[]>([]);
	let &[selected] = track<number | undefined>(undefined);

	const run = () => flushSync(() => {
		items = buildData(1000);
		selected = undefined;
	});
	const runLots = () => flushSync(() => {
		items = buildData(10000);
		selected = undefined;
	});
	const add = () => flushSync(() => {
		items = [...items, ...buildData(1000)];
	});
	const update = () => flushSync(() => {
		for (let i = 0; i < items.length; i += 10) {
			items[i].label.value += ' !!!';
		}
	});
	const clear = () => flushSync(() => {
		items = [];
		selected = undefined;
	});
	const swap = () => flushSync(() => {
		if (items.length > 998) {
			const clone = items.slice();
			const tmp = clone[1];
			clone[1] = clone[998];
			clone[998] = tmp;
			items = clone;
		}
	});
	const select = (id: number) => flushSync(() => {
		selected = id;
	});
	const remove = (row: Row) => flushSync(() => {
		const clone = items.slice();
		clone.splice(clone.indexOf(row), 1);
		items = clone;
	});

	<div class="container">
		<div class="jumbotron">
			<div class="row">
				<div class="col-md-6">
					<h1>{'Ripple keyed'}</h1>
				</div>
				<div class="col-md-6">
					<div class="row">
						<div class="col-sm-6 smallpad">
							<button
								type="button"
								class="btn btn-primary btn-block"
								id="run"
								onClick={run}
							>{'Create 1,000 rows'}</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button
								type="button"
								class="btn btn-primary btn-block"
								id="runlots"
								onClick={runLots}
							>{'Create 10,000 rows'}</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button
								type="button"
								class="btn btn-primary btn-block"
								id="add"
								onClick={add}
							>{'Append 1,000 rows'}</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button
								type="button"
								class="btn btn-primary btn-block"
								id="update"
								onClick={update}
							>{'Update every 10th row'}</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button
								type="button"
								class="btn btn-primary btn-block"
								id="clear"
								onClick={clear}
							>{'Clear'}</button>
						</div>
						<div class="col-sm-6 smallpad">
							<button
								type="button"
								class="btn btn-primary btn-block"
								id="swaprows"
								onClick={swap}
							>{'Swap Rows'}</button>
						</div>
					</div>
				</div>
			</div>
		</div>
		<table class="table table-hover table-striped test-data">
			<tbody>
				@for (const row of items; key row.id) {
					<tr class={selected === row.id ? 'danger' : ''}>
						<td class="col-md-1">{row.id}</td>
						<td class="col-md-4">
							<a onClick={() => select(row.id)}>{row.label.value}</a>
						</td>
						<td class="col-md-1">
							<a onClick={() => remove(row)}>
								<span class="glyphicon glyphicon-remove" aria-hidden="true" />
							</a>
						</td>
						<td class="col-md-6" />
					</tr>
				}
			</tbody>
		</table>
		<span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true" />
	</div>
}
