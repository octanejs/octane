import { useState } from 'octane';

// JSX (React-style `.tsx`) twin of ../../octane-tsrx/src/Main.tsrx. Octane's
// compiler lowers this through the SAME pipeline as the `.tsrx` directive form,
// so it emits identical DOM and the SAME six-button + table contract the
// Playwright harness drives. The two differ ONLY in authoring dialect:
//   * `@for (const row of items; key row.id) { … }`  →  `items.map((row) => <tr key={row.id}>…)`
//   * `class=` / `{x as string}` casts               →  `className=` / bare `{x}`
//   * `@{ … }` setup-then-output body                →  `return ( … )`
//
// The handlers are unchanged, so the same octane optimizations apply:
//   * Top-level handlers (run / runLots / add / clear / update / swap) only
//     close over setItems / setSelected (stable useState setters) → auto-callback
//     wrapped; the button click slots never reassign across renders.
//   * Per-row `onClick={() => select(row.id)}` / `() => remove(row)` arrows match
//     the event-bundle pattern — a `{ fn, args }` bundle per row that re-renders
//     with the same row identity skip the property write (load-bearing for swap).

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
	return (Math.random() * max) | 0;
}

function buildData(count) {
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

export default function Main() {
	const [items, setItems] = useState([]);
	const [selected, setSelected] = useState(0);

	const run = () => setItems(buildData(1000));
	const runLots = () => setItems(buildData(10000));
	const add = () => setItems((d) => d.concat(buildData(1000)));
	const update = () =>
		setItems((d) => {
			const out = d.slice();
			for (let i = 0; i < out.length; i += 10) {
				const r = out[i];
				out[i] = { id: r.id, label: r.label + ' !!!' };
			}
			return out;
		});
	const clear = () => setItems([]);
	const swap = () =>
		setItems((d) => {
			if (d.length <= 998) return d;
			const out = d.slice();
			const tmp = out[1];
			out[1] = out[998];
			out[998] = tmp;
			return out;
		});
	const select = (id) => setSelected(id);
	const remove = (row) =>
		setItems((d) => {
			const out = d.slice();
			out.splice(out.indexOf(row), 1);
			return out;
		});

	return (
		<div className="container">
			<div className="jumbotron">
				<div className="row">
					<div className="col-md-6">
						<h1>octane</h1>
					</div>
					<div className="col-md-6">
						<div className="row">
							<div className="col-sm-6 smallpad">
								<button type="button" className="btn btn-primary btn-block" id="run" onClick={run}>
									Create 1,000 rows
								</button>
							</div>
							<div className="col-sm-6 smallpad">
								<button
									type="button"
									className="btn btn-primary btn-block"
									id="runlots"
									onClick={runLots}
								>
									Create 10,000 rows
								</button>
							</div>
							<div className="col-sm-6 smallpad">
								<button type="button" className="btn btn-primary btn-block" id="add" onClick={add}>
									Append 1,000 rows
								</button>
							</div>
							<div className="col-sm-6 smallpad">
								<button
									type="button"
									className="btn btn-primary btn-block"
									id="update"
									onClick={update}
								>
									Update every 10th row
								</button>
							</div>
							<div className="col-sm-6 smallpad">
								<button type="button" className="btn btn-primary btn-block" id="clear" onClick={clear}>
									Clear
								</button>
							</div>
							<div className="col-sm-6 smallpad">
								<button
									type="button"
									className="btn btn-primary btn-block"
									id="swaprows"
									onClick={swap}
								>
									Swap Rows
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
			<table className="table table-hover table-striped test-data">
				<tbody>
					{/* td contents are kept inline: the .tsrx parser trips on a whitespace-only
					    text node between a <td> and its child inside a <tbody>{map → <tr>}; inline
					    children avoid it and emit identical DOM (selectors/innerHTML are whitespace-agnostic). */}
					{items.map((row) => (
						<tr key={row.id} className={selected === row.id ? 'danger' : ''}>
							<td className="col-md-1">{row.id}</td>
							<td className="col-md-4"><a onClick={() => select(row.id)}>{row.label}</a></td>
							<td className="col-md-1"><a onClick={() => remove(row)}><span className="glyphicon glyphicon-remove" aria-hidden="true" /></a></td>
							<td className="col-md-6" />
						</tr>
					))}
				</tbody>
			</table>
			<span className="preloadicon glyphicon glyphicon-remove" aria-hidden="true" />
		</div>
	);
}
