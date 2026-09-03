import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { act } from 'octane';
import { RouterProvider } from '@octanejs/tanstack-router';
import {
	makeSameRouteSearchRouter,
	deferredFor,
	resetDeferreds,
} from '../_fixtures/same-route-search.tsrx';

// router-core resolves matches asynchronously and store notifications drive
// octane re-renders on a macrotask — flush a few cycles + paints, the same shape
// the other router tests use.
async function flush() {
	for (let i = 0; i < 8; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

describe('@octanejs/tanstack-router — same-route search-param navigation', () => {
	// React 19.2.7 external-store updates are urgent, including notifications
	// delivered by a deferred View Transition callback. A route can preserve its
	// old content explicitly with useDeferredValue on the page render input.
	beforeEach(() => {
		// A View Transitions API shim whose update callback runs on a later
		// macrotask (mirroring a real browser's deferred DOM-update phase).
		(document as any).startViewTransition = (cb: () => void) => {
			setTimeout(() => cb(), 0);
			return {
				finished: Promise.resolve(),
				ready: Promise.resolve(),
				updateCallbackDone: Promise.resolve(),
			};
		};
	});

	afterEach(() => {
		delete (document as any).startViewTransition;
	});

	it.each([false, true])(
		'same-route suspension follows the route deferred-page policy (%s)',
		async (deferPage) => {
			resetDeferreds();
			// page=1 resolves up front so the initial view is committed content (not a
			// fallback) before we navigate.
			deferredFor(1).resolve('content-1');

			const router = makeSameRouteSearchRouter('/?page=1', { deferPage });
			// Drive the resolved commit through the (deferred) view transition.
			(router as any).options.defaultViewTransition = true;
			await router.load();
			const r = mount(RouterProvider as any, { router });
			await flush();

			// page=1 committed.
			expect(r.findAll('.stories').length).toBe(1);
			expect(r.find('.stories').textContent).toBe('content-1');
			expect(r.findAll('.stories-pending').length).toBe(0);

			// Probe the whole pending window; a transient fallback would violate the
			// deferred route's policy even if it disappears before the last checkpoint.
			const navP = router.navigate({ to: '/', search: { page: 2 } });
			let flashedPending = false;
			for (let i = 0; i < 20; i++) {
				await Promise.resolve();
				if (r.findAll('.stories-pending').length > 0) flashedPending = true;
				if (i % 2 === 1) {
					await new Promise((res) => setTimeout(res, 0));
					await nextPaint();
				}
			}
			await navP;

			// The router location advanced to ?page=2 …
			expect(router.state.location.search).toEqual({ page: 2 });

			// The raw store-driven route reveals fallback; the deferred route holds the
			// previous page visibly without changing the urgent router snapshot.
			expect(flashedPending).toBe(!deferPage);
			expect(r.findAll('.stories-pending').length).toBe(deferPage ? 0 : 1);
			expect(r.findAll('.stories').length).toBe(1);
			expect(r.find('.stories').textContent).toBe('content-1');
			expect((r.find('.stories') as HTMLElement).style.display).toBe(deferPage ? '' : 'none');

			// Resolve page=2; the transition can now commit the new page.
			await act(async () => {
				deferredFor(2).resolve('content-2');
				await flush();
			});

			expect(r.findAll('.stories').length).toBe(1);
			expect(r.find('.stories').textContent).toBe('content-2');
			expect(r.find('.stories').getAttribute('data-page')).toBe('2');
			expect(r.findAll('.stories-pending').length).toBe(0);

			r.unmount();
		},
	);

	it('exposes a canonical server redirect after the load settles', async () => {
		const router = makeSameRouteSearchRouter('/', { isServer: true });
		await router.load();

		// Server integrations can follow canonical redirects through the public
		// RouterState snapshot rather than reaching into the reactive store graph.
		expect(router.state.redirect?.options.href).toBe('/?page=1');
		// Redirect is a Response in the pinned RouterCore API. The router's
		// separately exposed status must preserve that same non-success code.
		expect(router.state.redirect?.status).toBe(307);
		expect(router.state.statusCode).toBe(router.state.redirect?.status);
	});
});
