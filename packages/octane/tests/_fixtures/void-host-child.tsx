import { createElement, useState } from 'octane';

// Void hosts (`<input>`, `<br>`, …) have no content model, so no renderable
// child may land inside one. A compiled template child is rejected at compile
// time, so these fixtures use de-opt `createElement(voidTag, null, child)`
// descriptors — the shape where the child value only exists at runtime.

let _show: ((v: boolean) => void) | null = null;
export function fillHole() {
	if (_show) _show(true);
}

function Kid() {
	return createElement('span', null, 'kid');
}

/** A component child inside a void host. */
export function VoidComponentChild() {
	return createElement('input', { id: 'vcc' }, createElement(Kid, null));
}

/** An array of children inside a void host. */
export function VoidArrayChild() {
	return createElement('br', null, [
		createElement(Kid, { key: 'a' }),
		createElement(Kid, { key: 'b' }),
	]);
}

/** A void host whose child starts absent and appears on a later render. */
export function VoidChildLater() {
	const [show, set] = useState(false);
	_show = set;
	return createElement(
		'div',
		{ id: 'vhl' },
		createElement('input', { id: 'vl' }, show ? createElement(Kid, null) : null),
	);
}
