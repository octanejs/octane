import Dexie from 'dexie';
import { createRoot, delegateEvents } from 'octane';
import { UpstreamApp } from '../../_fixtures/upstream-app.tsrx';

type Item = { id: number; name: string };

delegateEvents(['click']);

const db = new Dexie('octane-dexie-upstream-browser');
db.version(1).stores({
	items: 'id',
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('missing #root');

const root = createRoot(rootEl);
root.render(UpstreamApp, { db });

const api = {
	async clear() {
		await db.table('items').clear();
	},
	async bulkPut(items: Item[]) {
		await db.table('items').bulkPut(items);
	},
	async put(item: Item) {
		await db.table('items').put(item);
	},
	async delete(id: number) {
		await db.table('items').delete(id);
	},
	async update(id: number, changes: Partial<Item>) {
		await db.table('items').update(id, changes);
	},
};

(globalThis as typeof globalThis & { __dexieUpstream: typeof api }).__dexieUpstream = api;
