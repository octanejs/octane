import './deferred-hydration.css';

export function DeferredHydrationProof() @{
	const fixture = globalThis as
		typeof globalThis & {
			__fixtureDeferredHydrationClicks?: number;
		};
	<button
		class="vite-deferred-hydration-proof"
		onClick={() => {
			fixture.__fixtureDeferredHydrationClicks = (fixture.__fixtureDeferredHydrationClicks ?? 0) +
			1;
		}}
	>
		vite-deferred-hydration-chunk-proof
	</button>
}
