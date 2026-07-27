import { createElement, useState } from 'octane';

// A host rendered with NO children of its own — the shape a component uses when it fills an
// element imperatively (a DOM snapshot moved in with `replaceChildren`, a third-party widget).
function EmptyHost(props) {
	return createElement('div', { class: 'host', 'data-n': props.n });
}

export function ImperativeChildrenSurvive() @{
	const [n, setN] = useState(0);
	<div>
		<button class="bump" onClick={() => setN(n + 1)}>bump</button>
		<EmptyHost n={n} />
	</div>
}

// The same host, but the renderer DOES put children in it, then stops. Those are ours, so they
// have to go.
function OwnedHost(props) {
	return createElement(
		'div',
		{ class: 'owned' },
		props.show ? createElement('i', { class: 'mine' }) : null,
	);
}

export function OwnedChildrenStillClear() @{
	const [show, setShow] = useState(true);
	<div>
		<button class="toggle" onClick={() => setShow(false)}>hide</button>
		<OwnedHost show={show} />
	</div>
}
