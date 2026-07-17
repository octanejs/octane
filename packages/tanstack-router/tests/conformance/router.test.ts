import { describe, it, expect } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { RouterProvider } from '@octanejs/tanstack-router';
import { makeRouter } from '../_fixtures/basic.tsrx';

// router-core resolves matches asynchronously (load/navigate return promises) and
// the store notifications drive octane re-renders on a macrotask — flush a few
// cycles + paints, the same shape the query binding tests use.
async function flush() {
	for (let i = 0; i < 5; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

function deferViewTransitionCommit() {
	const originalStartViewTransition = (document as any).startViewTransition;
	let runUpdate: (() => Promise<void>) | undefined;
	let signalUpdateQueued: (() => void) | undefined;
	const updateQueued = new Promise<void>((resolve) => {
		signalUpdateQueued = resolve;
	});

	(document as any).startViewTransition = (update: () => void | Promise<void>) => {
		runUpdate = async () => {
			await update();
		};
		signalUpdateQueued!();
		return {
			finished: Promise.resolve(),
			ready: Promise.resolve(),
			updateCallbackDone: Promise.resolve(),
		};
	};

	return {
		updateQueued,
		runUpdate: () => runUpdate!(),
		restore() {
			if (originalStartViewTransition === undefined) {
				delete (document as any).startViewTransition;
			} else {
				(document as any).startViewTransition = originalStartViewTransition;
			}
		},
	};
}

describe('@octanejs/tanstack-router core seam', () => {
	it('renders the matched route through the layout Outlet', async () => {
		const router = makeRouter('/');
		await router.load();
		const r = mount(RouterProvider as any, { router });
		await flush();

		expect(r.findAll('.root').length).toBe(1); // root layout rendered
		expect(r.findAll('.index').length).toBe(1); // index child via <Outlet/>
		expect(r.find('.index').textContent).toBe('Index');
		expect(router.state.location.pathname).toBe('/');
		r.unmount();
	});

	it('await router.load leaves the initial route ready for the first render', async () => {
		const router = makeRouter('/');
		router.options.defaultViewTransition = true;
		const transition = deferViewTransitionCommit();

		try {
			let loadSettled = false;
			const load = router.load().then(() => {
				loadSettled = true;
			});
			await transition.updateQueued;
			await new Promise((resolve) => setTimeout(resolve, 0));

			// A platform View Transition may defer its update callback. The public
			// load promise must stay pending until that callback commits the matches.
			expect(loadSettled).toBe(false);
			await transition.runUpdate();
			await load;

			// No timer/store polling or post-mount flush is needed: consumers can
			// render or hydrate immediately after awaiting the initial load.
			const r = mount(RouterProvider as any, { router });
			expect(r.findAll('.root').length).toBe(1);
			expect(r.findAll('.index').length).toBe(1);
			r.unmount();
		} finally {
			transition.restore();
		}
	});

	it.each([
		['/load-failure', 500],
		['/load-not-found', 404],
	])('finalizes the %s status after a deferred match commit', async (path, expectedStatus) => {
		const router = makeRouter(path);
		router.options.defaultViewTransition = true;
		const transition = deferViewTransitionCommit();

		try {
			const load = router.load();
			await transition.updateQueued;
			expect(router.state.matches).toHaveLength(0);
			expect(router.state.statusCode).toBe(200);

			await transition.runUpdate();
			await load;

			expect(router.state.matches).not.toHaveLength(0);
			expect(router.state.statusCode).toBe(expectedStatus);
		} finally {
			transition.restore();
		}
	});

	it('rejects load when a synchronous view-transition commit throws', async () => {
		const router = makeRouter('/enter-failure');
		await expect(router.load()).rejects.toThrow('enter failed');
	});

	it('navigation swaps the Outlet content + updates location', async () => {
		const router = makeRouter('/');
		await router.load();
		const r = mount(RouterProvider as any, { router });
		await flush();
		expect(r.findAll('.index').length).toBe(1);

		await router.navigate({ to: '/about' });
		await flush();

		expect(r.findAll('.about').length).toBe(1); // about now rendered
		expect(r.findAll('.index').length).toBe(0); // index unmounted
		expect(r.findAll('.root').length).toBe(1); // layout stayed mounted
		expect(router.state.location.pathname).toBe('/about');
		r.unmount();
	});

	it('a Link click navigates and reflects active state', async () => {
		const router = makeRouter('/');
		await router.load();
		const r = mount(RouterProvider as any, { router });
		await flush();

		expect(r.find('.nav-home').getAttribute('data-status')).toBe('active');
		expect(r.find('.nav-about').getAttribute('data-status')).toBe(null);

		r.click('.nav-about'); // delegated onClick → preventDefault → router.navigate
		await flush();

		expect(r.findAll('.about').length).toBe(1);
		expect(router.state.location.pathname).toBe('/about');
		expect(r.find('.nav-about').getAttribute('data-status')).toBe('active');
		expect(r.find('.nav-home').getAttribute('data-status')).toBe(null);
		r.unmount();
	});

	it('useParams reads a path param', async () => {
		const router = makeRouter('/item/42');
		await router.load();
		const r = mount(RouterProvider as any, { router });
		await flush();

		expect(r.find('.item').textContent).toBe('Item 42');
		expect(router.state.location.pathname).toBe('/item/42');
		r.unmount();
	});

	it('nested routes render through a chain of Outlets', async () => {
		const router = makeRouter('/posts');
		await router.load();
		const r = mount(RouterProvider as any, { router });
		await flush();

		expect(r.findAll('.root').length).toBe(1); // root layout (Outlet #1)
		expect(r.findAll('.posts').length).toBe(1); // posts layout (Outlet #2)
		expect(r.findAll('.posts-index').length).toBe(1); // posts index (3rd match)
		r.unmount();
	});
});
