// E5 — Portal via react-dom. The one example that exercises the
// `react-dom` → octane re-home (codemod transform `reconcile-react-dom-imports`
// / detector rule `react-dom-rehome`), alongside state. A tooltip toggles a
// popup that renders into a detached portal host instead of its own subtree.
//
// The conditional lives in `Popup`'s plain-JS return (not a JSX-in-hole
// ternary) — both idiomatic React and friendlier to the compiler.
import { useState } from 'react';
import { createPortal } from 'react-dom';

function Popup(props: { open: boolean; host: Element }) {
	if (!props.open) return null;
	return createPortal(<span className="pop">hello</span>, props.host);
}

export function Tooltip(props: { host: Element }) {
	const [open, setOpen] = useState(false);
	return (
		<div className="tooltip">
			<button onClick={() => setOpen((o) => !o)}>toggle</button>
			<Popup open={open} host={props.host} />
		</div>
	);
}
