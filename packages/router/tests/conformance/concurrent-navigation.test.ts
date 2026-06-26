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
	// What this test PROVES today (the parts that hold in the unit harness):
	//   - navigating to a suspending route advances the router location
	//     immediately, and does NOT flash that route's pendingComponent;
	//   - once the data resolves the new route swaps in and the old one is gone.
	//
	// What it does NOT yet hold in this harness — see the `it.fails` GAP below:
	//   - keeping the OLD route's content on screen during the suspend window.
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

	// GAP: in a real browser, navigating from '/' to a feed whose data is slow keeps
	// the CURRENT page on screen (no skeleton flash) until the new page resolves.
	// In this unit harness that hold does NOT happen when the matched ROUTE changes:
	// router-core commits the new match id into `router.stores.matchesId` eagerly
	// (the old match id is replaced in the store BEFORE the new route's data
	// resolves), so the <Outlet/> re-renders <Match matchId={newId}/> with a fresh
	// id and octane unmounts the old <Match/> immediately. During the suspend window
	// the boundary is therefore blank (the pending fallback is correctly suppressed,
	// but the previous route's content is NOT retained). The browser-observed hold in
	// the HN example is a SAME-route, search-param-only change (the <Match/> instance
	// is preserved and its own Suspense holds), which is a different code path than a
	// route swap. Pinned so the suite stays green and auto-flips if/when octane learns
	// to retain the old <Match/> subtree across a transition-driven route swap.
	it.fails('GAP: holds the OLD route content on screen while the next route suspends', async () => {
		const deferred = createDeferred<string>();
		const router = makeConcurrentRouter('/', deferred);
		await router.load();
		const r = mount(RouterProvider as any, { router });
		await flush();
		expect(r.findAll('.home').length).toBe(1);

		await router.navigate({ to: '/slow' });
		await flush();

		// Location advanced, but the old '/' UI should still be mounted while
		// '/slow' is suspended. Today it is NOT — this assertion fails.
		expect(router.state.location.pathname).toBe('/slow');
		expect(r.findAll('.home').length).toBe(1);

		deferred.resolve('Slow page');
		await flush();
		r.unmount();
	});
});
