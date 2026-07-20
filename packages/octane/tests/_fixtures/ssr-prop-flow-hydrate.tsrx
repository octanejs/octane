import { use, useState } from 'octane';

// Prop-flow hydration shape: SeedPage inline-creates a promise in child-prop
// position (the server compile caches it via a prop-memo slot the client
// compile never allocates) AND both components carry state hooks plus a
// seeded use(). Hydration must be insensitive to server-only slots: seeds are
// consumed by the positional cursor in use()-call order, never by slot
// identity, and the shared sites' ids stay aligned across the two compiles
// (server-only slots take the tail of the module's range).
export function SeedPage(p) @{
	const [label] = useState('L');
	<main>
		<SeedCard promise={p.load('x')} tag={label} />
	</main>
}

export function SeedCard(props) @{
	const [n, setN] = useState(0);
	<div>
		@try {
			const v = use(props.promise);
			<button id="card" onClick={() => setN(n + 1)}>{v + ':' + props.tag + ':' + n}</button>
		} @pending {
			<i>p</i>
		}
	</div>
}
