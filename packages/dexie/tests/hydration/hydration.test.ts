import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { HydrationLiveQuery } from '../_fixtures/hydration.tsrx';

const databases: Dexie[] = [];

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		drainPassiveEffects();
		flushSync(() => {});
	}
}

afterEach(async () => {
	for (const db of databases.splice(0)) await db.delete();
});

describe('@octanejs/dexie — hydration', () => {
	it('adopts the server host, then replaces the default with live data', async () => {
		const db = new Dexie('octane-dexie-hydration');
		db.version(1).stores({ items: 'id' });
		databases.push(db);
		await db.table('items').add({ id: 1, name: 'client' });

		const container = document.createElement('div');
		container.innerHTML = '<div id="hydration-items">server</div>';
		document.body.appendChild(container);
		const existingHost = container.firstElementChild;
		const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const root = hydrateRoot(container, HydrationLiveQuery, { db });
			flushSync(() => {});
			expect(container.firstElementChild).toBe(existingHost);
			expect(container.textContent).toBe('server');

			await flush();
			expect(container.textContent).toBe('client');
			expect(warning).not.toHaveBeenCalled();
			root.unmount();
		} finally {
			warning.mockRestore();
			container.remove();
		}
	});
});
