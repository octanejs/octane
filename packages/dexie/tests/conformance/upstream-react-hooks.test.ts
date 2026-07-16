/**
 * Port of dexie-react-hooks@4.4.0 QUnit integration suite
 * (libs/dexie-react-hooks/test/index.ts) onto @octanejs/dexie.
 *
 * Upstream is the sole React integration suite for this surface — four
 * scenarios driving ItemList / ItemLoader / App against IndexedDB mutations
 * and navigation. Rewritten here as Vitest + .tsrx conformance (not Karma).
 */
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { UpstreamApp } from '../_fixtures/upstream-app.tsrx';

let databaseId = 0;
const databases: Dexie[] = [];

function createDatabase() {
	const db = new Dexie(`octane-dexie-upstream-${databaseId++}`);
	db.version(1).stores({
		items: 'id',
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

/** Collapse compiler whitespace so assertions match upstream textContent shapes. */
function compactText(value: string | null | undefined) {
	return value?.replace(/\s+/g, '') ?? value;
}

async function waitTilEqual(
	read: () => string | null | undefined,
	expected: string,
	label: string,
	attempts = 40,
) {
	const compactExpected = compactText(expected)!;
	let last: string | null | undefined;
	for (let i = 0; i < attempts; i++) {
		last = compactText(read());
		if (Object.is(last, compactExpected)) return;
		await flush();
	}
	expect(last, label).toEqual(compactExpected);
}

async function waitTilOk(read: () => boolean, label: string, attempts = 40) {
	for (let i = 0; i < attempts; i++) {
		if (read()) return;
		await flush();
	}
	expect(read(), label).toBe(true);
}

afterEach(async () => {
	for (const db of databases.splice(0)) {
		await db.delete();
	}
});

describe('upstream dexie-react-hooks integration scenarios', () => {
	// Per dexie-react-hooks test/index.ts: List component is reacting to changes
	it('List component is reacting to changes', async () => {
		const db = createDatabase();
		const result = mount(UpstreamApp, { db });

		await waitTilEqual(
			() => result.container.querySelector('ul#itemList')?.textContent,
			'',
			'The list should be empty',
		);

		await db.table('items').bulkPut([
			{ id: 1, name: 'Hello' },
			{ id: 2, name: 'World' },
		]);
		await waitTilEqual(
			() => result.container.querySelector('ul#itemList')?.textContent,
			'ID: 1Name: HelloID: 2Name: World',
			'The list should be populated',
		);

		await db.table('items').delete(2);
		await waitTilEqual(
			() => result.container.querySelector('ul#itemList')?.textContent,
			'ID: 1Name: Hello',
			'The second item should have been removed',
		);

		await db.table('items').update(1, { name: 'Hola' });
		await waitTilEqual(
			() => result.container.querySelector('ul#itemList')?.textContent,
			'ID: 1Name: Hola',
			'The first item should have been updated',
		);

		result.unmount();
	});

	// Per dexie-react-hooks test/index.ts: ItemLoaderComponent is reacting to changes
	it('ItemLoaderComponent is reacting to changes', async () => {
		const db = createDatabase();
		const result = mount(UpstreamApp, { db });
		const divCurrent = () => result.container.querySelector('div#current');

		await waitTilEqual(
			() => divCurrent()?.querySelector('p.not-found-item')?.textContent,
			'NOT_FOUND: 1',
			'Before we add anything - the component should say NOT_FOUND: 1',
		);

		await db.table('items').put({ id: 1, name: 'Foo' });
		await waitTilEqual(
			() => divCurrent()?.querySelector('div#item-1')?.textContent,
			'ID: 1Name: Foo',
			'Current item should have been rendered',
		);

		await db.table('items').update(1, { name: 'Bar' });
		await waitTilEqual(
			() => divCurrent()?.querySelector('div#item-1')?.textContent,
			'ID: 1Name: Bar',
			'Current item should have been updated',
		);

		await db.table('items').delete(1);
		await waitTilOk(() => {
			const current = divCurrent()?.querySelector('div#item-1');
			return !current;
		}, 'Item 1 should not be in the DOM tree anymore');
		expect(compactText(divCurrent()?.querySelector('p.not-found-item')?.textContent)).toBe(
			compactText('NOT_FOUND: 1'),
		);

		result.unmount();
	});

	// Per dexie-react-hooks test/index.ts: Clicking next button will update the currently viewed item
	it('Clicking next button will update the currently viewed item', async () => {
		const db = createDatabase();
		const result = mount(UpstreamApp, { db });
		const divCurrent = () => result.container.querySelector('div#current');

		await db.table('items').bulkPut([
			{ id: 1, name: 'Hello' },
			{ id: 2, name: 'World' },
		]);

		await waitTilEqual(
			() => divCurrent()?.textContent,
			'Current itemID: 1Name: Hello',
			'We are now viewing item 1',
		);

		result.click('#btnNext');
		await waitTilEqual(
			() => divCurrent()?.textContent,
			'Current itemID: 2Name: World',
			'We are now viewing item 2',
		);

		result.click('#btnFirst');
		await waitTilEqual(
			() => divCurrent()?.textContent,
			'Current itemID: 1Name: Hello',
			'We are now viewing item 1 again',
		);

		// Update item 2 while it's not rendered but still in the live-query cache:
		await db.table('items').update(2, { name: 'Earth' });
		result.click('#btnNext');
		await waitTilEqual(
			() => divCurrent()?.textContent,
			'Current itemID: 2Name: Earth',
			'We are now viewing updated item 2',
		);

		result.unmount();
	});

	// Per dexie-react-hooks test/index.ts: Selecting invalid key trigger the err-boundrary
	it('Selecting invalid key triggers the error boundary', async () => {
		const db = createDatabase();
		const result = mount(UpstreamApp, { db });

		await db.table('items').bulkPut([
			{ id: 1, name: 'Hello' },
			{ id: 2, name: 'World' },
		]);

		await waitTilOk(() => {
			const list = compactText(result.container.querySelector('ul#itemList')?.textContent);
			return list === compactText('ID: 1Name: HelloID: 2Name: World');
		}, "We have an initial setup with two items in the list: 'Hello' and 'World'");

		result.click('#btnInvalidKey');
		await waitTilOk(
			() => /Something went wrong/.test(result.container.textContent ?? ''),
			'The error boundary should be shown',
		);

		result.click('#btnFirst');
		result.click('#btnRetry');
		await waitTilEqual(
			() => result.container.querySelector('div#current')?.textContent,
			'Current itemID: 1Name: Hello',
			'We should be back to viewing item 1',
		);

		result.unmount();
	});
});
