import { createElement, useState } from 'octane-ts';

// Renders an ARRAY of host descriptors at a child position — the runtime de-opt
// path. Built with createElement directly so it works before the compiler lowers
// host-JSX-as-value, and so the SAME source runs on React (createElement →
// React.createElement) for differential parity. `className` is used (not `class`)
// because React maps it to the `class` attribute; Octane's de-opt does the same.
export function DeoptList(props) @{
	<ul>{props.items.map(
		(it) => createElement('li', { key: it.id, className: 'row' }, it.label),
	)}</ul>
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
		<button id="reverse" onClick={() => setItems([...items].reverse())}>{'rev'}</button>
		<button
			id="add"
			onClick={() => setItems([...items, { id: items.length + 1, label: 'x' }])}
		>{'add'}</button>
		<button id="remove" onClick={() => setItems(items.slice(1))}>{'rm'}</button>
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
	<ul>{props.items.map(
		(it) => <li key={it.id}>
			{it.label as string}
		</li>,
	)}</ul>
}

export function JsxListStateful() @{
	const [items, setItems] = useState([
		{ id: 1, label: 'a' },
		{ id: 2, label: 'b' },
		{ id: 3, label: 'c' },
	]);
	<div>
		<button id="reverse" onClick={() => setItems([...items].reverse())}>{'rev'}</button>
		<button
			id="add"
			onClick={() => setItems([...items, { id: items.length + 1, label: 'x' }])}
		>{'add'}</button>
		<button id="remove" onClick={() => setItems(items.slice(1))}>{'rm'}</button>
		<ul>{items.map(
			(it) => <li key={it.id}>
				{it.label as string}
			</li>,
		)}</ul>
	</div>
}
