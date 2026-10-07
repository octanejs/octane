import { createElement, useState } from 'octane';

// Renders an ARRAY of host descriptors at a child position — the runtime de-opt
// path. Built with createElement directly so it works before the compiler lowers
// host-JSX-as-value, and so the SAME source runs on React (createElement →
// React.createElement) for differential parity. `className` is used (not `class`)
// because React maps it to the `class` attribute; Octane's de-opt does the same.
export function DeoptList(props) @{
	<ul>
		{props.items.map((it) => createElement('li', { key: it.id, className: 'row' }, it.label))}
	</ul>
}

// Stateful version driving reorder / insert / remove through clicks, for the
// differential rig (React is the byte-for-byte oracle for each step).
export function DeoptListStateful() @{
	const [items, setItems] = useState([
		{ id: 1, label: 'a' },
		{ id: 2, label: 'b' },
		{ id: 3, label: 'c' },
	]);
	<div>
		<button id="reverse" onClick={() => setItems([...items].reverse())}>
			{'rev'}
		</button>
		<button id="add" onClick={() => setItems([...items, { id: items.length + 1, label: 'x' }])}>
			{'add'}
		</button>
		<button id="remove" onClick={() => setItems(items.slice(1))}>
			{'rm'}
		</button>
		<ul>{items.map((it) => createElement('li', { key: it.id, className: 'row' }, it.label))}</ul>
	</div>
}

// Array of UNKEYED host descriptors — exercises the index-fallback + dev warning.
export function DeoptUnkeyed(props) @{
	<ul>{props.items.map((it) => createElement('li', { className: 'row' }, it.label))}</ul>
}

// The ERGONOMIC form: plain JSX `.map` (no `createElement`). The compiler lowers
// `<li/>` at this value position to `createElement('li', …)`. Same source runs on
// React (where `.map(<li/>)` is native), so the differential rig proves parity.
export function JsxList(props) @{
	<ul>
		{props.items.map((it) => (
			<li key={it.id}>{it.label as string}</li>
		))}
	</ul>
}

// A return-JSX component with a typed destructured parameter, matching ordinary
// TSX function syntax used by application components.
export function DestructuredJsxList({ items }: { items: Array<{ id: number; label: string }> }) {
	return (
		<ul>
			{items.map((it) => (
				<li key={it.id}>{it.label as string}</li>
			))}
		</ul>
	);
}

export function JsxListStateful() @{
	const [items, setItems] = useState([
		{ id: 1, label: 'a' },
		{ id: 2, label: 'b' },
		{ id: 3, label: 'c' },
	]);
	<div>
		<button id="reverse" onClick={() => setItems([...items].reverse())}>
			{'rev'}
		</button>
		<button id="add" onClick={() => setItems([...items, { id: items.length + 1, label: 'x' }])}>
			{'add'}
		</button>
		<button id="remove" onClick={() => setItems(items.slice(1))}>
			{'rm'}
		</button>
		<ul>
			{items.map((it) => (
				<li key={it.id}>{it.label as string}</li>
			))}
		</ul>
	</div>
}

function CounterChild({ i }: { i: number }) {
	return <b>{String(i)}</b>;
}

// Each `.map` callback reassigns one counter. React reads it while that row's
// JSX evaluates, so the component prop, text child, and attribute all show the
// row's own value, not the counter's final one.
export function CounterJsxList() {
	let n = -1;
	return (
		<ul>
			{['a', 'b', 'c'].map((x) => {
				n++;
				return (
					<li key={x}>
						<CounterChild i={n} />
						<em data-n={String(n)}>{String(n)}</em>
					</li>
				);
			})}
		</ul>
	);
}

// A `for` loop pushing JSX while it reassigns a local and a parameter.
export function LoopPushedJsxList({ count }: { count: number }) {
	const rows = [];
	let label = '';
	for (let i = 0; i < 3; i++) {
		label = `row ${i}`;
		rows.push(
			<li key={i} data-label={label}>
				<CounterChild i={count} />
				{label as string}
			</li>,
		);
		count--;
	}
	return <ol>{rows}</ol>;
}

// Re-rendering restarts the counter from state. An event handler inside a row
// still closes over the live binding, which holds its final value by then.
export function CounterJsxListStateful() @{
	const [start, setStart] = useState(0);
	const [seen, setSeen] = useState(-1);
	let n = start;
	const rows = ['a', 'b'].map((x) => {
		n++;
		return (
			<li key={x}>
				<button id={`seen-${x}`} onClick={() => setSeen(n)}>
					{String(n)}
				</button>
			</li>
		);
	});
	n = 100;
	<div>
		<button id="restart" onClick={() => setStart(start + 10)}>
			{'restart'}
		</button>
		<p>{String(seen)}</p>
		<ul>{rows}</ul>
	</div>
}
