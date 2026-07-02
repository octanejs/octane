import { createElement, useState } from 'octane';

let _set = null;
export function setHidden(v) {
	if (_set) _set(v);
}

// A component RETURNING createElement routes through the de-opt host reconciler
// (hostElementBody + patchDeoptProps on re-render).
function Box(props) {
	return createElement('div', {
		id: 'box',
		style: props.hidden ? { display: 'none', color: 'red' } : { color: 'red' },
	});
}

export function StylePatch() @{
	const [hidden, set] = useState(true);
	_set = set;
	<div>{createElement(Box, { hidden })}</div>
}
