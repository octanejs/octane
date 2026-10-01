import { afterEach, describe, expect, it } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { RouterProvider } from '@octanejs/tanstack-router';
import { RouterClient } from '@octanejs/tanstack-router/ssr/client';
import type { AnyRouter } from '@tanstack/router-core';
import {
	componentRenders,
	createDeferred,
	makeMatchSuspensionRouter,
} from '../_fixtures/match-suspension.tsrx';

async function flush() {
	for (let i = 0; i < 6; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

async function wait(ms: number) {
	await new Promise((r) => setTimeout(r, ms));
	await flush();
}

// A match that keeps re-suspending retries on microtasks, where the test timeout
// can never fire. Every match render reads its store via
// `router.stores.getMatchStore`, so cap it to turn that livelock into a failure.
function failOnRenderLoop(router: AnyRouter) {
	const stores = router.stores as any;
	const getMatchStore = stores.getMatchStore.bind(stores);
	let reads = 0;
	stores.getMatchStore = (routeId: string) => {
		if (++reads > 20_000) throw new Error('route match render loop');
		return getMatchStore(routeId);
	};
}

afterEach(() => {
	delete (window as any).$_TSR;
});

// Per react-router's Match.tsx MatchInner: a suspended match stays suspended
// until the state that gates it ends, so the route component never renders
// before its loader data exists.
describe('@octanejs/tanstack-router — match suspension across match states', () => {
	it('keeps a hydrated ssr:false match pending until its client loader resolves', async () => {
		const client = createDeferred<string>();
		const router = makeMatchSuspensionRouter('/client', { client });
		failOnRenderLoop(router);

		// The dehydrated payload router-core's hydrate() reads: the root rendered
		// on the server and the ssr:false child is still pending. hydrate() force-
		// pends the child for pendingMinMs, then runs its loader on the client.
		const [rootMatch, clientMatch] = router.matchRoutes(router.stores.location.get());
		(window as any).$_TSR = {
			router: {
				manifest: undefined,
				lastMatchId: clientMatch.id,
				matches: [
					{ i: rootMatch.id, u: Date.now(), s: 'success', ssr: true },
					{ i: clientMatch.id, u: Date.now(), s: 'pending', ssr: false },
				],
			},
			buffer: [],
		};

		const r = mount(RouterClient as any, { router });
		await flush();
		expect(r.findAll('.pending').length).toBe(1);

		// pendingMinMs elapses while the loader is still running.
		await wait(60);

		expect(router.stores.getMatchStore(clientMatch.routeId).get()?.status).toBe('pending');
		expect(componentRenders).toEqual([]);
		expect(r.findAll('.client').length).toBe(0);
		expect(r.findAll('.pending').length).toBe(1);

		client.resolve('client data');
		await wait(40);

		expect(r.find('.client').textContent).toBe('client data');
		expect(r.findAll('.pending').length).toBe(0);
		expect(componentRenders).not.toEqual([]);
		expect(componentRenders.every((entry) => entry.data === 'client data')).toBe(true);
		r.unmount();
	});

	it('keeps a redirected match suspended until the redirect target loads', async () => {
		const guard = createDeferred<void>();
		const router = makeMatchSuspensionRouter('/', { guard });
		failOnRenderLoop(router);
		await router.load();
		const r = mount(RouterProvider as any, { router });
		await flush();
		expect(r.findAll('.home').length).toBe(1);

		// The loader hangs, so the pending match mounts after pendingMs.
		router.navigate({ to: '/guarded' });
		await wait(10);
		expect(r.findAll('.pending').length).toBe(1);

		// The loader redirects. Router-core marks the match redirected and resolves
		// its loadPromise, then loads /target on a 30ms timer before replacing it.
		guard.resolve();
		await wait(120);

		expect(router.state.location.pathname).toBe('/target');
		expect(r.findAll('.target').length).toBe(1);
		expect(r.findAll('.guarded').length).toBe(0);
		expect(componentRenders).toEqual([]);
		r.unmount();
	});
});
