import { useState } from 'octane';

// A React-style `.tsx` only-child bare `{expr}` value hole (NOT `{… as string}`).
// It lowers MARKERLESS — a single Text node appended to the host, no `<!>`
// placeholder and no `<!--[-->…<!--]-->` block on the server — so the client
// adopts the server's bare text on hydration, exactly like a `.tsrx` text hole.

let _bump: (() => void) | null = null;
export function bump() {
	if (_bump) _bump();
}

export function Counter() {
	const [n, setN] = useState(0);
	_bump = () => setN((x) => x + 1);
	return <span id="c">{n}</span>;
}
