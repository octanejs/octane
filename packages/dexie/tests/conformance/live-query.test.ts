import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import {
	AsyncLiveQueryReader,
	LiveQueryReader,
	QueryErrorBoundary,
} from '../_fixtures/live-query.tsrx';

let databaseId = 0;
const databases: Dexie[] = [];

function createDatabase() {
	const db = new Dexie(`octane-dexie-${databaseId++}`);
	db.version(1).stores({
		items: 'id, group',
		other: 'id',
	});
	databases.push(db);
	return db;
}

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		await nextPaint();
	}
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

afterEach(async () => {
	for (const db of databases.splice(0)) {
		await db.delete();
	}
});

describe('useLiveQuery with Dexie IndexedDB changes', () => {
	it('renders query results and reacts to affected add, update, and delete mutations', async () => {
		const db = createDatabase();
		await db.table('items').bulkAdd([
			{ id: 1, group: 'a', name: 'Alpha' },
			{ id: 2, group: 'b', name: 'Beta' },
		]);

		const result = mount(LiveQueryReader, { db, group: 'a' });
		await flush();
		expect(result.find('#items').textContent).toBe('Alpha');

		await db.table('items').add({ id: 3, group: 'a', name: 'Gamma' });
		await flush();
		expect(result.find('#items').textContent).toBe('AlphaGamma');

		await db.table('items').update(1, { name: 'Alpha updated' });
		await flush();
		expect(result.find('#items').textContent).toBe('Alpha updatedGamma');

		await db.table('items').delete(3);
		await flush();
		expect(result.find('#items').textContent).toBe('Alpha updated');
		result.unmount();
	});

	it('ignores mutations outside the observed query and resubscribes on dependency changes', async () => {
		const db = createDatabase();
		await db.table('items').bulkAdd([
			{ id: 1, group: 'a', name: 'Alpha' },
			{ id: 2, group: 'b', name: 'Beta' },
		]);

		const result = mount(LiveQueryReader, { db, group: 'a' });
		await flush();
		expect(result.find('#items').textContent).toBe('Alpha');

		await db.table('other').add({ id: 1, name: 'Unrelated' });
		await flush();
		expect(result.find('#items').textContent).toBe('Alpha');

		result.update(LiveQueryReader, { db, group: 'b' });
		await flush();
		expect(result.find('#items').textContent).toBe('Beta');

		result.unmount();
		await db.table('items').add({ id: 4, group: 'b', name: 'After unmount' });
		await flush();
	});

	it('resolves an asynchronous querier after returning its default result', async () => {
		const pending = deferred<Array<{ id: number; group: string; name: string }>>();
		const result = mount(AsyncLiveQueryReader, {
			querier: () => pending.promise,
			token: 0,
		});
		await nextPaint();
		expect(result.find('#async-items').textContent).toBe('');

		pending.resolve([{ id: 1, group: 'a', name: 'Loaded' }]);
		await flush();
		expect(result.find('#async-items').textContent).toBe('Loaded');
		result.unmount();
	});

	it('routes a rejected querier to the nearest Octane catch boundary', async () => {
		const result = mount(QueryErrorBoundary, {
			querier: async () => {
				throw new Error('query failed');
			},
		});
		await flush();
		expect(result.find('#query-error').textContent).toBe('query failed');
		result.unmount();
	});
});
