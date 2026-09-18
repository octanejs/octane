import { test, expect, vi } from 'vitest';

(globalThis as Record<string, unknown>).__REACT_GRAB_DISABLED__ = true;

// Regression: the ported render loop must mount the shadow-root renderer
// without entering a useSyncExternalStore update loop (fresh-object prop
// accessors feed a cached snapshot in useProp).
test('init mounts the overlay renderer into the shadow root', { timeout: 20_000 }, async () => {
	const { init } = await import('../src/index.js');
	const api = init();
	try {
		await vi.waitFor(
			() => {
				const host = document.querySelector('[data-react-grab]');
				expect(host).not.toBeNull();
				const shadow = (host as HTMLElement).shadowRoot;
				expect(shadow?.querySelector('[data-react-grab-overlay-canvas]')).not.toBeNull();
			},
			{ timeout: 10_000 },
		);
	} finally {
		api.dispose();
	}
});
