import { useState } from 'octane';

// A `+`-concatenation hole with NO `as string` cast: the compiler proves it is a
// string (the `'Count: '` literal operand) and emits a text binding (htext), not
// a renderable childSlot — so the cast is unnecessary.
export function ConcatCount() @{
	const [n, setN] = useState(0);
	<button onClick={() => setN(n + 1)}>
		{'Count: ' + n}
	</button>
}

// A BARE identifier hole `{label}` with NO cast: `label` is a setup `const` bound
// to a `+`-concatenation, so the compiler tracks it back to a string and emits a
// text binding — the identifier needs no `as string`. Used to prove server +
// client classify the hole identically (hydration adopts, no rebuild).
export function Labelled() @{
	const [n, setN] = useState(0);
	const label = 'n=' + n;
	<button onClick={() => setN(n + 1)}>{label}</button>
}
