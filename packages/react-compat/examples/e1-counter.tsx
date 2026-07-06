// E1 — EASY. A pure-logic hook + a trivial component.
// Uses only `useState` (lazy init + functional updates). This is the
// "bridgeable" floor: every API maps 1:1 to Octane, the only mechanical
// change is reconciling the `react` import so Octane's compiler owns the
// hook binding it re-injects.
import { useState } from 'react';

export function useCounter(initial = 0) {
	const [count, setCount] = useState(() => initial);
	return {
		count,
		inc: () => setCount((c) => c + 1),
		dec: () => setCount((c) => c - 1),
		reset: () => setCount(initial),
	};
}

export function Counter(props: { start?: number }) {
	const { count, inc } = useCounter(props.start ?? 0);
	return <button onClick={inc}>count: {count}</button>;
}
