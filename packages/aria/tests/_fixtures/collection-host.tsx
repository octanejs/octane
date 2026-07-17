import { createPortal, useState } from 'octane';

// The Phase-4 collection host (docs/aria-migration-plan.md §2a) relies on two octane
// behaviors these fixtures pin ahead of time:
//   1. the SAME children render function mounted at two positions simultaneously
//      (react-aria's hidden structural copy + the real tree), each position with
//      independent DOM but shared reactive updates;
//   2. `createPortal` into a DETACHED, never-attached container element (the hidden
//      copy renders off-DOM), including updates, keyed reorder identity, and teardown.

function TwoCopies(props: { children?: any }) {
	return (
		<div>
			<div data-copy="a">{props.children}</div>
			<div data-copy="b">{props.children}</div>
		</div>
	);
}

// 1 — the same children function rendered twice, driven by parent state.
export function DualMountChildren() {
	const [n, setN] = useState(0);
	return (
		<div>
			<button onClick={() => setN(n + 1)}>bump</button>
			<TwoCopies>
				<span>{'n=' + n}</span>
			</TwoCopies>
		</div>
	);
}

// 2 — portal into a detached container passed in via props (the test owns it).
export function DetachedPortal(props: { target: HTMLElement }) {
	const [items, setItems] = useState(['a', 'b', 'c']);
	return (
		<div>
			<button data-action="reorder" onClick={() => setItems(['c', 'a', 'b'])}>
				reorder
			</button>
			<button data-action="drop" onClick={() => setItems(['a'])}>
				drop
			</button>
			{createPortal(
				<ul>
					{items.map((it) => (
						<li key={it} data-k={it}>
							{it}
						</li>
					))}
				</ul>,
				props.target,
			)}
		</div>
	);
}

// 3 — the actual collection-host shape: the SAME children render function rendered
// once into a DETACHED portal container (the "hidden structural copy") and once in
// the live tree, both tracking the same state.
function HiddenAndLive(props: { target: HTMLElement; children?: any }) {
	return (
		<div>
			{createPortal(<div data-hidden-copy="">{props.children}</div>, props.target)}
			<div data-live="">{props.children}</div>
		</div>
	);
}

export function HiddenCopyShape(props: { target: HTMLElement }) {
	const [label, setLabel] = useState('one');
	return (
		<div>
			<button onClick={() => setLabel('two')}>rename</button>
			<HiddenAndLive target={props.target}>
				<span data-item={label}>{label}</span>
			</HiddenAndLive>
		</div>
	);
}
