import Dexie from 'dexie';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/live-query.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

async function settleIndexedDb() {
	for (let index = 0; index < 5; index++) await new Promise((resolve) => setTimeout(resolve, 0));
}

await Promise.all([preloadDifferentialFixture(FIXTURE, CACHE)]);

describe('differential: @octanejs/dexie vs dexie-react-hooks', () => {
	// @parity-case differential:dexie-live-query
	it('useLiveQuery renders and reacts to IndexedDB writes byte-identically', async () => {
		const db = new Dexie('octane-dexie-differential');
		db.version(1).stores({ items: 'id, group' });
		await db.table('items').add({ id: 1, group: 'a', name: 'Alpha' });
		const differential = await mountDifferential(
			FIXTURE,
			'LiveQueryReader',
			{ db, group: 'a' },
			CACHE,
		);
		await differential.step('initial query', settleIndexedDb);
		await differential.step('affected add', async () => {
			await db.table('items').add({ id: 2, group: 'a', name: 'Gamma' });
			await settleIndexedDb();
		});
		differential.unmount();
		await db.delete();
	});
});
