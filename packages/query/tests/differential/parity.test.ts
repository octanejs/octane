/**
 * Differential parity: the SAME `.tsrx` runs through @octanejs/query (octane) AND
 * real @tanstack/react-query (the setup rewrites `@octanejs/query` →
 * `@tanstack/react-query`). The rendered result shape (data + status + flags)
 * must be byte-identical after every step — proving the octane binding wires up
 * query-core exactly like react-query, across the sync (initialData), async
 * (pending → success), and mutation (idle → pending → success) lifecycles.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const CACHED = resolve(__dirname, '../_fixtures/cached-diff.tsrx');
const ASYNC = resolve(__dirname, '../_fixtures/async-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));

describe('differential: @octanejs/query vs real @tanstack/react-query', () => {
	it('CachedApp: initialData query renders byte-identical result shape', async () => {
		const d = await mountDifferential(CACHED, 'CachedApp', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('AsyncApp: pending → success renders byte-identical at both steps', async () => {
		const d = await mountDifferential(ASYNC, 'AsyncApp', undefined, CACHE);
		await d.step('mount (pending)', () => {});
		await d.step('settled (success)', async () => {
			await settle();
		});
		d.unmount();
	});

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
});
