// Exercises the two server bindings BLOCKER 1 adds: a CUSTOM HOOK (the compiler
// lowers its inner hook calls through `withSlot`) and `startTransition`. A server
// build of any `.tsrx` that uses these must resolve them from `octane/server`.
import { useState, startTransition } from 'octane';

// A custom hook — its inner useState is reached through the wrapper, so the
// compiler emits `withSlot(sym, useState, …)` at this call site in BOTH modes.
function useCounter(initial) {
	const [n, setN] = useState(initial);
	return [n, () => startTransition(() => setN(n + 1))];
}

export function Widget(props) @{
	const [count, inc] = useCounter(props.start);
	<button id="w" onClick={inc}>
		{'count:' + count as string}
	</button>
}
