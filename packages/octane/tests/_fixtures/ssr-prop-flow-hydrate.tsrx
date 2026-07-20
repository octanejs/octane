import { use, useState } from 'octane';

// Prop-flow hydration shape: SeedPage inline-creates a promise in child-prop
// position (server compile caches it via a server-only prop-memo slot, which
// advances the module's hook-symbol counter ahead of SeedCard's client slots)
// AND both components carry state hooks plus a seeded use(). Hydration must be
// insensitive to that server/client slot-id divergence: seeds are consumed by
// the positional cursor in use()-call order, never by slot identity.
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
