import { useState, useEffect } from 'octane';

// A user-defined custom hook with multiple base hooks. "Hooks everywhere": the
// compiler slots its base hooks even though it's a plain function, not a
// component — and a component calling it wraps the call in `withSlot` so the
// SAME hook reused at two call sites keeps independent state.
function useCounter(start) {
	const [n, setN] = useState(start);
	const [touched, setTouched] = useState(false);
	return {
		n,
		touched,
		inc: () => {
			setN(n + 1);
			setTouched(true);
		},
	};
}

// Custom hook composing another custom hook (nested).
function useLabelledCounter(start, label) {
	const c = useCounter(start);
	return { text: label + ':' + c.n, inc: c.inc };
}

export function ReuseApp() @{
	const a = useCounter(0);
	const b = useCounter(100);
	<div>
		<button class="a" onClick={a.inc}>{a.n as string}</button>
		<button class="b" onClick={b.inc}>{b.n as string}</button>
		<span class="ta">{(a.touched ? 'y' : 'n') as string}</span>
	</div>
}

export function NestedApp() @{
	const c = useLabelledCounter(5, 'x');
	<button class="n" onClick={c.inc}>{c.text as string}</button>
}
