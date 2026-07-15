import { useLayoutEffect, useState } from 'octane';

// Exposes its `setN` via a module-level shim so tests can fire updates from
// outside the component body — exactly the situation `act()` warns about.
let _setN = null;
export function bump() {
	if (_setN) _setN((n) => n + 1);
}

export default function Counter() @{
	const [n, setN] = useState(0);
	_setN = setN;
	<div class="c">
		{n as number}
	</div>
}

export function ActLayoutLoop() @{
	const [value, setValue] = useState(0);
	useLayoutEffect(() => {
		setValue((current) => current + 1);
	}, null);
	<span>
		{value as number}
	</span>
}
