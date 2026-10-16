import { describe, it, expect } from 'vitest';
import { act, startTransition } from 'octane';
import { mount, nextPaint } from '../_helpers';
import { RouterProvider } from '@octanejs/tanstack-router';
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

describe('@octanejs/tanstack-router — concurrent navigation (startTransition)', () => {
	it.each([false, true])(
		'keeps the visible route during an urgent provider update while navigation suspends (async action: %s)',
		async (asyncAction) => {
			const deferred = createDeferred<string>();
			const router = makeConcurrentRouter('/', deferred);
			await router.load();
			const view = mount(RouterProvider as any, { router });
			await flush();
			const home = view.find('.home');
			const visible: boolean[] = [];
			const observer = new MutationObserver(() => visible.push(home.isConnected));
			try {
				observer.observe(view.container, { childList: true, subtree: true });
				if (asyncAction)
					startTransition(async () => {
						await router.navigate({ to: '/slow-bare' });
					});
				else void router.navigate({ to: '/slow-bare' });
				await flush();
				expect(view.find('.home')).toBe(home);
				view.update(RouterProvider as any, { router, defaultPreload: 'intent' });
				await flush();
				observer.disconnect();
				expect(visible).not.toContain(false);
				expect(view.find('.home')).toBe(home);
				expect(view.findAll('.slow')).toHaveLength(0);
				deferred.resolve('Slow page');
				await flush();
				expect(view.find('.slow').textContent).toBe('Slow page');
				expect(router.state.resolvedLocation?.pathname).toBe('/slow-bare');
			} finally {
				observer.disconnect();
				view.unmount();
			}
		},
	);

	it.each(['invalidate', 'navigate', 'same-route', 'load'] as const)(
		'settles an async action awaiting router.%s',
		async (operation) => {
			const deferred = createDeferred<string>();
			deferred.resolve('Slow page');
			const router = makeConcurrentRouter('/', deferred);
			await router.load();
			const r = mount(RouterProvider as any, { router });
			await flush();
			let settled = false;
			let failure: unknown;
			try {
				startTransition(async () => {
					try {
						if (operation === 'invalidate') await router.invalidate({ sync: true });
						else if (operation === 'same-route') {
							for (let i = 0; i < 3; i++) await router.navigate({ to: '/' });
						} else if (operation === 'load') {
							for (let i = 0; i < 3; i++) await router.load({ sync: true });
						} else await router.navigate({ to: '/slow' });
						settled = true;
					} catch (error) {
						failure = error;
					}
				});
				await flush();
				expect(failure).toBeUndefined();
				expect(settled).toBe(true);
				expect(r.find(operation === 'navigate' ? '.slow' : '.home').textContent).toBe(
					operation === 'navigate' ? 'Slow page' : 'Home',
				);
			} finally {
				r.unmount();
			}
		},
	);

	// The router drives navigation state commits through octane's startTransition
	// (Transitioner.tsrx), so React's transition/Suspense contract applies:
	//
	//   - a suspension inside an ALREADY-REVEALED boundary (or with no new
	//     boundary at all) holds the current UI — no fallback flash;
	//   - a NEW Suspense boundary mounted BY the transition shows its fallback
	//     immediately (React does not make transitions wait for content the user
	//     has never seen).
	//
	// react-router's Match mounts a Suspense boundary only when the destination
	// route has a pendingComponent (Match.tsx ResolvedSuspenseBoundary), so
	// navigating to a suspending route WITH a pendingComponent swaps promptly to
	// that fallback — upstream parity, pinned here.
	it('navigating to a suspending route WITH a pendingComponent shows the fallback, then swaps', async () => {
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

		// The router location advanced, and the route's NEW Suspense boundary
		// (created for its pendingComponent) shows the fallback while the
		// component suspends — the old page does not linger.
		expect(router.state.location.pathname).toBe('/slow');
		expect(r.findAll('.slow-pending').length).toBe(1);
		expect(r.findAll('.slow').length).toBe(0);
		expect(r.findAll('.home').length).toBe(0);

		// Resolve the data; the content replaces the fallback.
		await act(async () => {
			deferred.resolve('Slow page');
			await flush();
		});

		expect(r.findAll('.slow').length).toBe(1);
		expect(r.find('.slow').textContent).toBe('Slow page');
		expect(r.findAll('.slow-pending').length).toBe(0);

		r.unmount();
	});

	// With NO pendingComponent on the destination, no new Suspense boundary
	// mounts — the navigation transition cannot commit while the new route is
	// suspended, so the CURRENT page stays on screen until the data resolves
	// (React's transition-holds-prior-content contract; octane implements it via
	// the off-screen WIP swap in runtime.ts).
	it('holds the OLD route content on screen while a boundary-less next route suspends', async () => {
		const deferred = createDeferred<string>();
		const router = makeConcurrentRouter('/', deferred);
		await router.load();
		const r = mount(RouterProvider as any, { router });
		await flush();
		expect(r.findAll('.home').length).toBe(1);

		await router.navigate({ to: '/slow-bare' });
		await flush();

		// Location advanced, and the old '/' UI stays mounted while '/slow-bare'
		// is suspended (no pendingComponent → no new boundary → hold).
		expect(router.state.location.pathname).toBe('/slow-bare');
		expect(r.findAll('.home').length).toBe(1);
		expect(r.findAll('.slow').length).toBe(0);

		await act(async () => {
			deferred.resolve('Slow page');
			await flush();
		});

		expect(r.findAll('.slow').length).toBe(1);
		expect(r.findAll('.home').length).toBe(0);
		r.unmount();
	});
});
