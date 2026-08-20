import { useState } from 'octane';
import './layout-deferred-hydration.css';

export function LayoutDeferredHydrationProof() @{
	const [clicks, setClicks] = useState(0);
	<button
		class="vite-layout-deferred-hydration-proof"
		onClick={() => setClicks((count) => count + 1)}
	>
		{'vite-layout-deferred-hydration-chunk-proof: ' + clicks}
	</button>
}
