import { describe, it, expect } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { RouterProvider } from '@octanejs/router';
import { makeConcurrentRouter, createDeferred } from '../_fixtures/concurrent-navigation.tsrx';

// router-core resolves matches asynchronously and store notifications drive
// octane re-renders on a macrotask — flush a few cycles + paints, the same
// shape the other router tests use.
async function flush() {
	for (let i = 0; i < 6; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

describe('@octanejs/router — concurrent navigation (startTransition)', () => {
	// The router drives navigation state commits through octane's startTransition
	// (Transitioner.tsrx: `router.startTransition = (fn) => startTransition(fn)`).
	// The intent: when the next route suspends, octane holds the
	// currently-committed UI on screen until the new route's data resolves —
	// instead of flashing the new route's pending fallback.
	//
	// What this test proves:
	//   - navigating to a suspending route advances the router location
	//     immediately, and does NOT flash that route's pendingComponent;
	//   - once the data resolves the new route swaps in and the old one is gone.
	// (Keeping the OLD route on screen during the suspend window is proved by the
	// next test — octane's off-screen WIP swap holds it.)
	it('advances the location and suppresses the pending fallback while suspended, then swaps', async () => {
		const deferred = createDeferred<string>();
		const router = makeConcurrentRouter('/', deferred);
		await router.load();
		const r = mount(RouterProvider as any, { router });
		await flush();

		// '/' is committed: the stable home marker is on screen.
		expect(r.findAll('.home').length).toBe(1);
		expect(r.findAll('.slow').length).toBe(0);
		expect(r.findAll('.slow-pending').length).toBe(0);

		// Navigate to the suspending route. Do NOT resolve the deferred yet.
		await router.navigate({ to: '/slow' });
		await flush();

		// The router location has already advanced to '/slow' (navigation state
		// committed inside the transition) …
		expect(router.state.location.pathname).toBe('/slow');

		// … and because navigation ran inside a transition, octane does NOT flash
		// the '/slow' route's pending fallback while it is still suspended.
		expect(r.findAll('.slow-pending').length).toBe(0);
		expect(r.findAll('.slow').length).toBe(0);

		// Resolve the data; the transition can now commit the new route.
		deferred.resolve('Slow page');
		await flush();

		// '/slow' content is shown and the old '/' marker is gone.
		expect(r.findAll('.slow').length).toBe(1);
		expect(r.find('.slow').textContent).toBe('Slow page');
		expect(r.findAll('.home').length).toBe(0);
		expect(r.findAll('.slow-pending').length).toBe(0);

		r.unmount();
	});

	// Navigating from '/' to a slow route keeps the CURRENT page on screen until the new
	// page resolves — React's transition-holds-prior-content contract. octane now matches
	// it via off-screen (WIP-model) rendering: a transition swap to a fresh-suspending
	// subtree (here the route's `<Comp/>` componentSlot swaps Home→Slow inside the Match's
	// `@try`) is rendered OFF-SCREEN; when it suspends the new partial is discarded and the
	// suspend is re-thrown so the enclosing tryBlock holds the OLD content live, resuming +
	// committing atomically once the data resolves. (Was an octane-runtime GAP — the swap
	// used to clear the old content before the new one suspended; see the off-screen
	// renderOffscreen/commitOffscreen path in runtime.ts.)
	it('holds the OLD route content on screen while the next route suspends', async () => {
		const deferred = createDeferred<string>();
		const router = makeConcurrentRouter('/', deferred);
		await router.load();
		const r = mount(RouterProvider as any, { router });
		await flush();
		expect(r.findAll('.home').length).toBe(1);

		await router.navigate({ to: '/slow' });
		await flush();

		// Location advanced, and the old '/' UI stays mounted while '/slow' is
		// suspended (octane's off-screen WIP swap holds the prior content).
		expect(router.state.location.pathname).toBe('/slow');
		expect(r.findAll('.home').length).toBe(1);

		deferred.resolve('Slow page');
		await flush();
		r.unmount();
	});
});
