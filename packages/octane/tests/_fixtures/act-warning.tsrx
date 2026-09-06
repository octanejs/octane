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
	<div class="c">{n as number}</div>
}

export function ActLayoutLoop() @{
	const [value, setValue] = useState(0);
	useLayoutEffect(() => {
		setValue((current) => current + 1);
	}, null);
	<span>{value as number}</span>
}

export function PreviousProp({ value }: { value: string }) {
	const [state, setState] = useState({ value, previous: '(none)' });
	if (state.value !== value) setState({ value, previous: state.value });
	return <output>{state.previous as string}</output>;
}

let _failRender = null;
export function failActRender() {
	if (_failRender) _failRender();
}

export function ActRenderFailure({ message }: { message: string }) @{
	const [failed, setFailed] = useState(false);
	_failRender = () => setFailed(true);
	if (failed) throw new Error(message);
	<span>ready</span>
}
