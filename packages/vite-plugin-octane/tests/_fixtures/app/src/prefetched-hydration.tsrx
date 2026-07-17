import { useEffect, useState } from 'octane';

export function PrefetchedHydrationProof() @{
	const [active, setActive] = useState(false);
	const [clicks, setClicks] = useState(0);
	useEffect(() => {
		setActive(true);
	}, []);
	<button
		class="vite-prefetched-hydration-proof"
		data-active={active ? 'true' : 'false'}
		data-clicks={String(clicks)}
		onClick={() => setClicks((count) => count + 1)}
	>
		vite-prefetched-hydration-chunk-proof
	</button>
}
