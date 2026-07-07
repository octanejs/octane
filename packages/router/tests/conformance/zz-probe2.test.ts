import { it } from 'vitest';
import { makeLifecycleRouter, createDeferred } from '../_fixtures/lifecycle.tsrx';

it('probe: core-only navigation with slow loader', async () => {
	const deferred = createDeferred<string>();
	const router = makeLifecycleRouter('/', { deferred });
	await router.load();

	const nav = router.navigate({ to: '/slow-loader' });
	nav.catch((e: any) => console.log('NAV REJECTED:', e));
	await new Promise((r) => setTimeout(r, 20));
	console.log(
		'DURING:',
		router.state.matches.map((m: any) => ({ r: m.routeId, s: m.status })),
		'pending:',
		router.state.pendingMatches?.map((m: any) => ({ r: m.routeId, s: m.status })),
	);

	deferred.resolve('data');
	await new Promise((r) => setTimeout(r, 20));
	console.log(
		'AFTER:',
		router.state.matches.map((m: any) => ({ r: m.routeId, s: m.status })),
	);
});
