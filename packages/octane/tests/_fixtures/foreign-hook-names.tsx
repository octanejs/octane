import { useId, useState } from './foreign-hook-names/lib.ts';

// `useId`/`useState` here are IMPORTS FROM ANOTHER MODULE that shadow octane's
// builtin hook names. The compiled output must call the imported functions —
// injecting octane's own `useId`/`useState` imports would both collide with
// these bindings (a parse error) and call the wrong implementation.
export function ForeignHookNames() {
	const id = useId('x');
	const [a, b, getC] = useState('init');
	return <div id={id}>{a + ':' + b + ':' + getC()}</div>;
}
