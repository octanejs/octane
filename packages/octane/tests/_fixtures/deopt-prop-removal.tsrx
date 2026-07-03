import { createElement, useState } from 'octane';

let _set = null;
export function setAlt(v) {
	if (_set) _set(v);
}

// A component RETURNING createElement routes through the de-opt host reconciler
// (hostElementBody + patchDeoptProps on re-render). The two prop sets share the
// tag so the element is REUSED and the vanished props must be removed via the
// shared removal path (removeHostProp).
function Label(props) {
	return createElement(
		'label',
		props.alt
			? { id: 'target', 'data-alt': '1' }
			: {
					id: 'target',
					htmlFor: 'field',
					className: 'big',
					suppressHydrationWarning: true,
				},
		'name',
	);
}

export function PropRemoval() @{
	const [alt, set] = useState(false);
	_set = set;
	<div>{createElement(Label, { alt })}</div>
}
