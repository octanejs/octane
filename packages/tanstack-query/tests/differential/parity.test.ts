/**
 * Differential parity: the SAME `.tsrx` runs through @octanejs/tanstack-query (octane) AND
 * real @tanstack/react-query (the setup rewrites `@octanejs/tanstack-query` →
 * `@tanstack/react-query`). The rendered result shape (data + status + flags)
 * must be byte-identical after every step — proving the octane binding wires up
 * query-core exactly like react-query, across the sync (initialData), async
 * (pending → success), and mutation (idle → pending → success) lifecycles, and
 * that sequential suspense queries keep the boundary on its fallback until every
 * query has data.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const CACHED = resolve(__dirname, '../_fixtures/cached-diff.tsrx');
const ASYNC = resolve(__dirname, '../_fixtures/async-diff.tsrx');
const SEQUENTIAL = resolve(__dirname, '../_fixtures/sequential-suspense-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

await Promise.all([
	preloadDifferentialFixture(CACHED, CACHE),
	preloadDifferentialFixture(ASYNC, CACHE),
	preloadDifferentialFixture(SEQUENTIAL, CACHE),
]);

const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));

// The first query settles at 10ms and the second 200ms after that; compare the
// fallback, the first-settled window, and the final result. The last wait
// outlasts React's 300ms throttle on revealing content after a fallback.
async function expectSequentialSuspense(order: string) {
	const d = await mountDifferential(SEQUENTIAL, 'SequentialSuspenseApp', { order }, CACHE);
	await d.step('mount (both pending)', () => {});
	await d.step('first settled, second pending', async () => {
		await settle(40);
	});
	await d.step('both settled', async () => {
		await settle(500);
	});
	d.unmount();
}

describe('differential: @octanejs/tanstack-query vs real @tanstack/react-query', () => {
	// @parity-case differential:tanstack-query-cached
	it('CachedApp: initialData query renders byte-identical result shape', async () => {
		const d = await mountDifferential(CACHED, 'CachedApp', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	// @parity-case differential:tanstack-query-async
	it('AsyncApp: pending → success renders byte-identical at both steps', async () => {
		const d = await mountDifferential(ASYNC, 'AsyncApp', undefined, CACHE);
		await d.step('mount (pending)', () => {});
		await d.step('settled (success)', async () => {
			await settle();
		});
		d.unmount();
	});

	// @parity-case differential:tanstack-query-mutation
	it('MutationApp: idle → pending → success renders byte-identical', async () => {
		const d = await mountDifferential(ASYNC, 'MutationApp', undefined, CACHE);
		await d.step('mount (idle)', () => {});
		await d.step('mutate + settle (success)', async (i, r) => {
			await i.click('#go');
			await r.click('#go');
			await settle();
		});
		d.unmount();
	});

	// @parity-case differential:tanstack-query-sequential-suspense
	it('SequentialSuspenseApp: useSuspenseQuery → useSuspenseQuery holds the fallback until both settle', async () => {
		await expectSequentialSuspense('singular-singular');
	});

	// @parity-case differential:tanstack-query-grouped-singular-suspense
	it('SequentialSuspenseApp: useSuspenseQueries → useSuspenseQuery holds the fallback until both settle', async () => {
		await expectSequentialSuspense('grouped-singular');
	});

	// @parity-case differential:tanstack-query-grouped-grouped-suspense
	it('SequentialSuspenseApp: useSuspenseQueries → useSuspenseQueries holds the fallback until both settle', async () => {
		await expectSequentialSuspense('grouped-grouped');
	});
});
