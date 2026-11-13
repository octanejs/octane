import { expect, test, type Page, type Request, type Route } from '@playwright/test';
import {
	collectBrowserDiagnostics,
	settleBrowserFrames,
	type BrowserDiagnostics,
} from '../../_shared/e2e/browser.ts';

const runtimeDiagnostics = new WeakMap<Page, BrowserDiagnostics>();

test.beforeEach(async ({ page }) => {
	runtimeDiagnostics.set(page, collectBrowserDiagnostics(page));
});

test.afterEach(async ({ page }, testInfo) => {
	const diagnostics = runtimeDiagnostics.get(page);
	if (diagnostics === undefined) return;
	try {
		await settleBrowserFrames(page);
		diagnostics.assertClean(testInfo.title);
	} finally {
		diagnostics.stop();
	}
});

const PAGES = [
	{ name: 'Octane', path: '/', serverRendered: true },
	{ name: 'React', path: '/react.html', serverRendered: true },
	{ name: 'Octane with a React island', path: '/mixed.html', serverRendered: false },
];

let namespace = 0;

/** Every store request is a call to `data`, the shelf's one server function. */
const isData = (url: URL) => url.pathname.startsWith('/_$_ripple_rpc_$_/');

/** The store request a call to `data` sends: the strings in its encoded arguments. */
function storeRequest(request: Request): string | null {
	if (!isData(new URL(request.url()))) return null;
	const strings = (value: unknown): string[] =>
		typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(strings) : [];
	const body = strings(JSON.parse(request.postData() ?? '[]')).join('\n');
	// A connection to the shelf's feed, through `events`, loads nothing.
	return body.includes('books.changes') ? null : body;
}

/** Open a page on server data no other test shares. */
async function open(page: Page, path: string): Promise<void> {
	await page.goto(`${path}?ns=${Date.now()}-${++namespace}`);
	await expect(page.getByRole('list', { name: 'Books' })).toBeVisible();
	await expect(page.getByText('3 books · 0 read')).toBeVisible();
}

/** Hold write requests at the network until `release` is called. */
async function holdWrites(page: Page) {
	const held: Route[] = [];
	await page.route(isData, (route) => {
		if ((storeRequest(route.request()) ?? '').includes('"write"')) held.push(route);
		else void route.continue();
	});
	return {
		count: () => held.length,
		async release() {
			for (const route of held.splice(0)) await route.continue();
		},
	};
}

const book = (page: Page, title: string) =>
	page
		.getByRole('list', { name: 'Books' })
		.getByRole('listitem')
		.filter({ has: page.getByText(title, { exact: true }) });
const finishedList = (page: Page) => page.getByRole('region', { name: 'Finished' });
const status = (page: Page) => page.getByRole('status');
const network = (page: Page) => page.getByRole('region', { name: 'Network' });

for (const { name, path, serverRendered } of PAGES) {
	test.describe(name, () => {
		if (serverRendered) {
			test('arrives rendered, and hydrates without loading its data again', async ({
				page,
				browser,
			}) => {
				const url = `${path}?ns=${Date.now()}-${++namespace}`;

				// Without JavaScript the server's page is the whole page.
				const context = await browser.newContext({ javaScriptEnabled: false });
				const staticPage = await context.newPage();
				await staticPage.goto(url);
				await expect(book(staticPage, 'Kindred')).toBeVisible();
				await expect(staticPage.getByText('3 books · 0 read')).toBeVisible();
				await context.close();

				const loads: string[] = [];
				page.on('request', (request) => {
					const sent = storeRequest(request);
					if (sent !== null) loads.push(sent);
				});
				await page.goto(url);
				await expect(page.getByText('3 books · 0 read')).toBeVisible();
				// Hydration is complete once an edit works; nothing was loaded to get there.
				await book(page, 'Kindred').getByRole('checkbox').click();
				await expect(status(page)).toHaveText('Saved');
				// The edit is the only request the page has made.
				expect(loads).toHaveLength(1);
				expect(loads[0]).toContain('books.setRead');
				await expect(page.getByText('3 books · 1 read')).toBeVisible();
			});

			test('adds, refuses and removes books with JavaScript off', async ({ browser }) => {
				const context = await browser.newContext({ javaScriptEnabled: false });
				const staticPage = await context.newPage();
				const url = `${path}?ns=${Date.now()}-${++namespace}`;
				await staticPage.goto(url);
				const title = staticPage.getByRole('textbox', { name: 'Book title' });
				const error = staticPage.locator('.field-error');

				// Each submission posts to the page; an accepted one redirects back to it.
				await title.fill('Station Eleven');
				await staticPage.getByRole('button', { name: 'Add' }).click();
				await expect(book(staticPage, 'Station Eleven')).toBeVisible();
				await expect(staticPage.getByText('4 books · 0 read')).toBeVisible();
				expect(new URL(staticPage.url()).search).toBe(new URL(url, 'http://x').search);
				await expect(title).toHaveValue('');

				// A refused one renders the page again, keeping what was typed and saying why.
				await title.fill('kindred');
				await staticPage.getByRole('button', { name: 'Add' }).click();
				await expect(error).toHaveText('That book is already on the shelf');
				await expect(title).toHaveValue('kindred');
				await title.fill('');
				await staticPage.getByRole('button', { name: 'Add' }).click();
				await expect(error).toHaveText('Enter a title');

				await staticPage.getByRole('button', { name: 'Remove Piranesi' }).click();
				await expect(book(staticPage, 'Piranesi')).toHaveCount(0);
				await expect(staticPage.getByText('3 books · 0 read')).toBeVisible();
				await context.close();
			});

			test('hydrates a page that shows a refused submission, then submits through the store', async ({
				page,
			}) => {
				// The refused page's 400 status is expected; a hydration mismatch is not.
				runtimeDiagnostics.get(page)!.stop();
				runtimeDiagnostics.set(
					page,
					collectBrowserDiagnostics(page, {
						failOnHydrationWarnings: true,
						ignore: (diagnostic) => diagnostic.message.includes('status of 400'),
					}),
				);
				await open(page, path);
				const title = page.getByRole('textbox', { name: 'Book title' });
				await title.fill('kindred');
				// `submit()` skips the submit event, so the form posts natively even once hydrated.
				await page.locator('form.add').evaluate((form: HTMLFormElement) => form.submit());
				await expect(page.locator('.field-error')).toHaveText('That book is already on the shelf');
				await expect(title).toHaveValue('kindred');

				// The page that came back hydrates with the same refusal, and takes the next submission in place.
				await title.fill('Station Eleven');
				await page.getByRole('button', { name: 'Add' }).click();
				await expect(status(page)).toHaveText('Saved');
				await expect(page.locator('.field-error')).toHaveCount(0);
				await expect(title).toHaveValue('');
				await expect(network(page).getByText('write books.add')).toHaveCount(1);
			});
		}

		test("shows another tab's edits as they happen, without loading them", async ({ page }) => {
			const url = `${path}?ns=${Date.now()}-${++namespace}`;
			await page.goto(url);
			await expect(page.getByText('Live', { exact: true })).toBeVisible();
			const other = await page.context().newPage();
			await other.goto(url);
			await expect(other.getByText('3 books · 0 read')).toBeVisible();
			await expect(other.getByText('Live', { exact: true })).toBeVisible();

			const loads: string[] = [];
			page.on('request', (request) => {
				const sent = storeRequest(request);
				if (sent !== null) loads.push(sent);
			});
			await book(other, 'Kindred').getByRole('checkbox').click();
			await expect(book(page, 'Kindred').getByRole('checkbox')).toBeChecked();
			await expect(finishedList(page).getByRole('listitem')).toHaveText(['Kindred']);
			await expect(page.getByText('3 books · 1 read')).toBeVisible();

			await other.getByRole('textbox', { name: 'Book title' }).fill('Station Eleven');
			await other.getByRole('button', { name: 'Add' }).click();
			await expect(book(page, 'Station Eleven')).toBeVisible();
			await book(other, 'Station Eleven')
				.getByRole('button', { name: /Remove/ })
				.click();
			await expect(book(page, 'Station Eleven')).toHaveCount(0);
			await expect(page.getByText('3 books · 1 read')).toBeVisible();
			expect(loads).toEqual([]);
			await other.close();
		});

		test('shows an edit before the reply and settles it in one round trip', async ({ page }) => {
			await open(page, path);
			const writes = await holdWrites(page);

			await book(page, 'Kindred').getByRole('checkbox').click();
			await expect(book(page, 'Kindred').getByRole('checkbox')).toBeChecked();
			// The finished list is a view, so the book moves into it before the reply.
			await expect(finishedList(page).getByRole('listitem')).toHaveText(['Kindred']);
			await expect.poll(writes.count).toBe(1);
			await expect(status(page)).toHaveText('');

			await writes.release();
			await expect(status(page)).toHaveText('Saved');
			await expect(page.getByText('3 books · 1 read')).toBeVisible();
			await expect(finishedList(page).getByRole('listitem')).toHaveText(['Kindred']);
			// The reply carried the saved book, which the views take, and the counts back.
			await expect(network(page).getByRole('listitem').first()).toHaveText(
				'write books.setRead + 1 read back',
			);
		});

		test('adds and removes books by ID, and rolls back a refused add', async ({ page }) => {
			await open(page, path);

			await page.getByRole('textbox', { name: 'Book title' }).fill('Station Eleven');
			await page.getByRole('button', { name: 'Add' }).click();
			await expect(book(page, 'Station Eleven')).toBeVisible();
			// The list is ordered by title, and a new book takes its place in that order.
			await expect(page.getByRole('list', { name: 'Books' }).getByRole('listitem')).toHaveText([
				/Kindred/,
				/Piranesi/,
				/Station Eleven/,
				/The Left Hand of Darkness/,
			]);
			await expect(status(page)).toHaveText('Saved');
			await expect(page.getByText('4 books · 0 read')).toBeVisible();

			await page.getByRole('button', { name: 'Remove Piranesi' }).click();
			await expect(book(page, 'Piranesi')).toHaveCount(0);
			await expect(page.getByText('3 books · 0 read')).toBeVisible();

			const writes = await holdWrites(page);
			await page.getByRole('textbox', { name: 'Book title' }).fill('kindred');
			await page.getByRole('button', { name: 'Add' }).click();
			await expect(book(page, 'kindred')).toBeVisible();
			// A durable write is sent once it is in the journal, so wait for it to reach the network.
			await expect.poll(writes.count).toBe(1);
			await writes.release();
			await expect(status(page)).toHaveText('That book is already on the shelf');
			await expect(book(page, 'kindred')).toHaveCount(0);
			await expect(book(page, 'Kindred')).toHaveCount(1);
			// A refused submission keeps what was typed.
			await expect(page.getByRole('textbox', { name: 'Book title' })).toHaveValue('kindred');

			await page.getByRole('textbox', { name: 'Book title' }).fill('');
			await page.getByRole('button', { name: 'Add' }).click();
			await expect(status(page)).toHaveText('Enter a title');
			await expect(page.locator('.field-error')).toHaveText('Enter a title');
		});

		test('settles a write whose reply was lost by looking it up, without resending it', async ({
			page,
		}) => {
			await open(page, path);
			await page.getByRole('checkbox', { name: 'Lose the next reply' }).check();

			await page.getByRole('textbox', { name: 'Book title' }).fill('Station Eleven');
			await page.getByRole('button', { name: 'Add' }).click();
			await expect(status(page)).toContainText('The reply was lost');
			await expect(book(page, 'Station Eleven')).toHaveCount(1);

			await status(page).getByRole('button', { name: 'Check saved result' }).click();
			await expect(status(page)).toHaveText('Saved');
			await expect(book(page, 'Station Eleven')).toHaveCount(1);
			await expect(page.getByText('4 books · 0 read')).toBeVisible();
			await expect(network(page).getByText('write books.add')).toHaveCount(1);
		});

		test('keeps an offline edit until a lookup shows it never arrived', async ({ page }) => {
			await open(page, path);
			const offline = page.getByRole('checkbox', { name: 'Offline' });
			await offline.check();

			await book(page, 'Piranesi').getByRole('checkbox').click();
			await expect(status(page)).toContainText('The reply was lost');
			await expect(book(page, 'Piranesi').getByRole('checkbox')).toBeChecked();

			await offline.uncheck();
			await status(page).getByRole('button', { name: 'Check saved result' }).click();
			await expect(status(page)).toHaveText('The server never received that change');
			await expect(book(page, 'Piranesi').getByRole('checkbox')).not.toBeChecked();
		});

		test('gives each account its own store', async ({ page }) => {
			await open(page, path);
			await book(page, 'Kindred').getByRole('checkbox').click();
			await expect(status(page)).toHaveText('Saved');

			await page
				.getByRole('navigation', { name: 'Account' })
				.getByRole('button', { name: 'grace' })
				.click();
			await expect(page.getByText('2 books · 0 read')).toBeVisible();
			await expect(book(page, 'The Dispossessed')).toBeVisible();
			await expect(book(page, 'Kindred')).toHaveCount(0);

			await page
				.getByRole('navigation', { name: 'Account' })
				.getByRole('button', { name: 'ada' })
				.click();
			await expect(page.getByText('3 books · 1 read')).toBeVisible();
			await expect(book(page, 'Kindred').getByRole('checkbox')).toBeChecked();
		});
	});
}

test('starts the lists from the encrypted cache after a reload, without loading them', async ({
	page,
}) => {
	await open(page, '/mixed.html');
	await book(page, 'Kindred').getByRole('checkbox').click();
	await expect(page.getByText('3 books · 1 read')).toBeVisible();
	await expect(finishedList(page).getByRole('listitem')).toHaveText(['Kindred']);

	const reads: string[] = [];
	page.on('request', (request) => {
		const sent = storeRequest(request);
		if (sent !== null) reads.push(sent);
	});
	await page.reload();
	await expect(book(page, 'Kindred').getByRole('checkbox')).toBeChecked();
	await expect(finishedList(page).getByRole('listitem')).toHaveText(['Kindred']);
	await expect(page.getByText('3 books · 1 read')).toBeVisible();
	// The lists are fresh for 30 seconds, so only the counts, which are never fresh, reload.
	expect(
		reads.filter((body) => body.includes('books.list') || body.includes('books.finished')),
	).toEqual([]);
	// What the cache holds is encrypted: no title is readable in IndexedDB.
	const saved = await page.evaluate(
		() =>
			new Promise<string>((resolve) => {
				const opening = indexedDB.open('shelf');
				opening.onsuccess = () => {
					const all = opening.result.transaction('value').objectStore('value').getAll();
					all.onsuccess = () => resolve(JSON.stringify(all.result));
				};
			}),
	);
	expect(saved.length).toBeGreaterThan(100);
	expect(saved).not.toContain('Kindred');
});

test('settles a write left unsettled by a reload from its receipt, without sending it again', async ({
	page,
}) => {
	await open(page, '/mixed.html');
	await page.getByRole('checkbox', { name: 'Offline' }).check();
	await book(page, 'Piranesi').getByRole('checkbox').click();
	await expect(status(page)).toContainText('The reply was lost');

	// Hold the receipt lookup, so the recovered edit can be seen before it settles.
	const held: Route[] = [];
	const writes: string[] = [];
	await page.route(isData, (route) => {
		const body = storeRequest(route.request()) ?? '';
		if (body.includes('"write"')) writes.push(body);
		if (body.includes('books.receipt')) held.push(route);
		else void route.continue();
	});
	await page.reload();
	await expect(book(page, 'Piranesi').getByRole('checkbox')).toBeChecked();
	await expect.poll(() => held.length).toBe(1);

	// The server never received it, so the receipt rolls the edit back.
	for (const route of held.splice(0)) await route.continue();
	await expect(book(page, 'Piranesi').getByRole('checkbox')).not.toBeChecked();
	expect(writes).toEqual([]);
});

test('a React island and its Octane page show the same edit and the same rollback', async ({
	page,
}) => {
	await open(page, '/mixed.html');
	const island = page.getByRole('region', { name: 'React island' });
	const writes = await holdWrites(page);

	await island.getByRole('button', { name: 'Mark Kindred read from React' }).click();
	await expect(book(page, 'Kindred').getByRole('checkbox')).toBeChecked();
	await expect(island.getByText('Kindred')).toHaveCount(0);
	await expect.poll(writes.count).toBe(1);
	await writes.release();
	await expect(page.getByText('3 books · 1 read')).toBeVisible();

	await book(page, 'Piranesi').getByRole('checkbox').click();
	await expect(island.getByText('Piranesi')).toHaveCount(0);

	// An offline edit from the Octane page rolls back in the React island too.
	await page.getByRole('checkbox', { name: 'Offline' }).check();
	await book(page, 'The Left Hand of Darkness').getByRole('checkbox').click();
	await expect(island.getByText('The Left Hand of Darkness')).toHaveCount(0);
	await page.getByRole('checkbox', { name: 'Offline' }).uncheck();
	await status(page).getByRole('button', { name: 'Check saved result' }).click();
	await expect(island.getByText('The Left Hand of Darkness')).toBeVisible();
});

/**
 * Drive the shelf's data worker for `namespace` through the DevTools protocol: a
 * worker's requests never reach Playwright's routes. `keeper` starts the worker
 * first, under the name `sharedOwner` gives it, so no request is missed.
 */
async function dataWorker(keeper: Page, namespace: string) {
	await keeper.goto('/_octane/data-worker.js');
	await keeper.evaluate((name) => {
		(window as { worker?: SharedWorker }).worker = new SharedWorker('/_octane/data-worker.js', {
			type: 'module',
			name,
		});
	}, `octane-data:4:${namespace}:ada`);
	const cdp = await keeper.context().browser()!.newBrowserCDPSession();
	let targetId = '';
	await expect
		.poll(async () => {
			const { targetInfos } = await cdp.send('Target.getTargets');
			targetId = targetInfos.find((target) => target.type === 'shared_worker')?.targetId ?? '';
			return targetId;
		})
		.not.toBe('');
	const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: false });
	let id = 0;
	const send = (method: string, params: object = {}) =>
		cdp.send('Target.sendMessageToTarget', {
			sessionId,
			message: JSON.stringify({ id: ++id, method, params }),
		});
	/** The data calls the worker has sent: store requests, and connections to the feed. */
	const sent: string[] = [];
	cdp.on('Target.receivedMessageFromTarget', ({ message }) => {
		const { method, params } = JSON.parse(message);
		if (method !== 'Network.requestWillBeSent' || !isData(new URL(params.request.url))) return;
		sent.push(params.request.postData ?? '');
	});
	await send('Network.enable');
	return {
		reads: () => sent.filter((body) => body.includes('\\"kind\\"') && !body.includes('write')),
		feeds: () => sent.filter((body) => body.includes('books.changes')),
		writes: () => sent.filter((body) => body.includes('write')),
		latency: (latency: number) =>
			send('Network.emulateNetworkConditions', {
				offline: false,
				latency,
				downloadThroughput: -1,
				uploadThroughput: -1,
			}),
		block: (blocked: boolean) =>
			send('Network.setBlockedURLs', { urls: blocked ? ['*_$_ripple_rpc_$_*'] : [] }),
	};
}

test('tabs that share the data worker load each read once, and show the same pending edit and rollback', async ({
	page,
}) => {
	const ns = `${Date.now()}-${++namespace}`;
	const url = `/mixed.html?ns=${ns}&owner=shared`;
	const keeper = await page.context().newPage();
	const worker = await dataWorker(keeper, ns);

	// Two tabs open at once, on a network slow enough that their reads overlap.
	await worker.latency(2_000);
	const other = await page.context().newPage();
	await Promise.all([page.goto(url), other.goto(url)]);
	for (const tab of [page, other]) {
		await expect(tab.getByText('3 books · 0 read')).toBeVisible({ timeout: 15_000 });
		await expect(tab.getByText('Live', { exact: true })).toBeVisible();
	}
	await worker.latency(0);
	// Each read was sent once for both tabs, and both share one feed connection.
	const reads = worker.reads();
	expect(reads.length).toBeGreaterThan(0);
	expect(new Set(reads).size).toBe(reads.length);
	expect(worker.feeds()).toHaveLength(1);

	// An edit whose request fails shows in both tabs until one tab learns it never arrived.
	await worker.block(true);
	await book(page, 'Kindred').getByRole('checkbox').click();
	await expect(status(page)).toHaveText(/The reply was lost/);
	for (const tab of [page, other])
		await expect(book(tab, 'Kindred').getByRole('checkbox')).toBeChecked();
	await worker.block(false);
	await status(page).getByRole('button', { name: 'Check saved result' }).click();
	await expect(status(page)).toHaveText('The server never received that change');
	for (const tab of [page, other]) {
		await expect(book(tab, 'Kindred').getByRole('checkbox')).not.toBeChecked();
		await expect(tab.getByText('3 books · 0 read')).toBeVisible();
	}
	expect(worker.writes()).toHaveLength(1);
	await other.close();
	await keeper.close();
});

test('signs every shared tab of an account out when another account signs in, even one that was frozen', async ({
	page,
}) => {
	const url = `/?ns=${Date.now()}-${++namespace}&owner=shared`;
	const other = await page.context().newPage();
	for (const tab of [page, other]) {
		await tab.goto(url);
		await expect(tab.getByText('3 books · 0 read')).toBeVisible();
	}
	const lifecycle = await page.context().newCDPSession(other);
	await lifecycle.send('Page.setWebLifecycleState', { state: 'frozen' });

	await page
		.getByRole('navigation', { name: 'Account' })
		.getByRole('button', { name: 'grace' })
		.click();
	await expect(page.getByText('2 books · 0 read')).toBeVisible();
	await expect(book(page, 'The Dispossessed')).toBeVisible();

	// The frozen tab resumes on the old account, and shows nothing of it.
	await lifecycle.send('Page.setWebLifecycleState', { state: 'active' });
	await expect(other.getByText('Loading the shelf…')).toBeVisible();
	await expect(book(other, 'Kindred')).toHaveCount(0);

	// Signing the first account in again works in a tab, and the second account's tabs are signed out.
	await page
		.getByRole('navigation', { name: 'Account' })
		.getByRole('button', { name: 'ada' })
		.click();
	await expect(page.getByText('3 books · 0 read')).toBeVisible();
	await other.close();
});

test('reconnects every shared tab to a new data worker after the worker crashes', async ({
	page,
	browser,
}) => {
	test.setTimeout(90_000);
	const url = `/?ns=${Date.now()}-${++namespace}&owner=shared`;
	const other = await page.context().newPage();
	for (const tab of [page, other]) {
		await tab.goto(url);
		await expect(tab.getByText('3 books · 0 read')).toBeVisible();
	}
	const cdp = await browser.newBrowserCDPSession();
	const workers = async () =>
		(await cdp.send('Target.getTargets')).targetInfos.filter(
			(target) => target.type === 'shared_worker',
		);
	const [crashed] = await workers();
	await cdp.send('Target.closeTarget', { targetId: crashed!.targetId });

	// Each tab notices the silence within three 5 s heartbeats, starts the worker again, and
	// carries on with it.
	await expect
		.poll(async () => (await workers()).map((target) => target.targetId), { timeout: 40_000 })
		.toEqual([expect.not.stringMatching(crashed!.targetId)]);
	await page.waitForTimeout(20_000);
	await book(page, 'Kindred').getByRole('checkbox').click();
	await expect(status(page)).toHaveText('Saved', { timeout: 15_000 });
	await expect(book(other, 'Kindred').getByRole('checkbox')).toBeChecked();
	await other.close();
});

test('starts a shared tab from the data worker’s cache after a reload, without loading', async ({
	page,
}) => {
	const ns = `${Date.now()}-${++namespace}`;
	const keeper = await page.context().newPage();
	const worker = await dataWorker(keeper, ns);
	await page.goto(`/mixed.html?ns=${ns}&owner=shared`);
	await expect(page.getByText('3 books · 0 read')).toBeVisible();
	await book(page, 'Kindred').getByRole('checkbox').click();
	await expect(page.getByText('3 books · 1 read')).toBeVisible();
	await expect(finishedList(page).getByRole('listitem')).toHaveText(['Kindred']);
	// Saved through the worker, once its next task runs.
	await page.waitForTimeout(200);

	const before = worker.reads().length;
	await page.reload();
	await expect(book(page, 'Kindred').getByRole('checkbox')).toBeChecked();
	await expect(finishedList(page).getByRole('listitem')).toHaveText(['Kindred']);
	// The lists are fresh for 30 seconds: the worker's cache serves them.
	const lists = worker
		.reads()
		.slice(before)
		.filter((body) => body.includes('books.list') || body.includes('books.finished'));
	expect(lists).toEqual([]);
	const saved = await page.evaluate(
		() =>
			new Promise<string>((resolve) => {
				const opening = indexedDB.open('shelf');
				opening.onsuccess = () => {
					const all = opening.result.transaction('value').objectStore('value').getAll();
					all.onsuccess = () => resolve(JSON.stringify(all.result));
				};
			}),
	);
	expect(saved).not.toContain('Kindred');
	await keeper.close();
});
