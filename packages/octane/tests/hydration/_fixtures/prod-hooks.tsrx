import { useState } from 'octane';

// Same-module custom hook — the compiler wraps each CALL in withSlot(_h$N, …),
// and the runtime composes the effective slot for the inner useState from the
// SLOT SYMBOL DESCRIPTIONS (resolveSlot). This fixture exists to smoke-test
// that composition under PROD compile options (hmr:false → numeric base-hook
// ids plus custom-boundary Symbols described from a unique module range): with
// description-less Symbol() slots (the 2026-07-08
// regression) both call sites below collapsed onto one composed slot, `b` read
// `a`'s state, and the server/client renders diverged → website-wide hydration
// mismatch. See hydration/prod-mode-hydrate.test.ts.
function useCounter(initial: number) {
	const [n, setN] = useState(initial);
	return [n, setN] as const;
}

export function App() @{
	const [a, setA] = useCounter(1);
	const [b] = useCounter(100);
	<div class="app">
		@if (a > 0) {
			<p class="a">{'a:' + a}</p>
		}
		<p class="b">{'b:' + b}</p>
		<button class="bump" onClick={() => setA((v: number) => v + 1)}>bump</button>
	</div>
}
