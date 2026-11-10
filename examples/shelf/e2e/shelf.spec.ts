import { expect, test, type Page, type Route } from '@playwright/test';
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

/** Open a page on server data no other test shares. */
async function open(page: Page, path: string): Promise<void> {
	await page.goto(`${path}?ns=${Date.now()}-${++namespace}`);
	await expect(page.getByRole('list', { name: 'Books' })).toBeVisible();
	await expect(page.getByText('3 books · 0 read')).toBeVisible();
}

/** Hold write requests at the network until `release` is called. */
async function holdWrites(page: Page) {
	const held: Route[] = [];
	await page.route('**/data', (route) => {
		if (route.request().postData()?.includes('"write"')) held.push(route);
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
					if (new URL(request.url()).pathname === '/data') loads.push(request.postData() ?? '');
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
		}

		test('shows an edit before the reply and settles it in one round trip', async ({ page }) => {
			await open(page, path);
			const writes = await holdWrites(page);

			await book(page, 'Kindred').getByRole('checkbox').click();
			await expect(book(page, 'Kindred').getByRole('checkbox')).toBeChecked();
			await expect.poll(writes.count).toBe(1);
			await expect(status(page)).toHaveText('');

			await writes.release();
			await expect(status(page)).toHaveText('Saved');
			await expect(page.getByText('3 books · 1 read')).toBeVisible();
			// The write's reply carried the list and the counts back, so neither reloads.
			await expect(network(page).getByRole('listitem').first()).toHaveText(
				'write books.setRead + 2 reads back',
			);
		});

		test('adds and removes books by ID, and rolls back a refused add', async ({ page }) => {
			await open(page, path);

			await page.getByRole('textbox', { name: 'Book title' }).fill('Station Eleven');
			await page.getByRole('button', { name: 'Add' }).click();
			await expect(book(page, 'Station Eleven')).toBeVisible();
			await expect(status(page)).toHaveText('Saved');
			await expect(page.getByText('4 books · 0 read')).toBeVisible();

			await page.getByRole('button', { name: 'Remove Piranesi' }).click();
			await expect(book(page, 'Piranesi')).toHaveCount(0);
			await expect(page.getByText('3 books · 0 read')).toBeVisible();

			const writes = await holdWrites(page);
			await page.getByRole('textbox', { name: 'Book title' }).fill('kindred');
			await page.getByRole('button', { name: 'Add' }).click();
			await expect(book(page, 'kindred')).toBeVisible();
			await writes.release();
			await expect(status(page)).toHaveText('That book is already on the shelf');
			await expect(book(page, 'kindred')).toHaveCount(0);
			await expect(book(page, 'Kindred')).toHaveCount(1);

			await page.getByRole('button', { name: 'Add' }).click();
			await expect(status(page)).toHaveText('Enter a title');
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

test('a React island and its Octane page show the same edit and the same rollback', async ({
	page,
}) => {
	await open(page, '/mixed.html');
	const island = page.getByRole('region', { name: 'React island' });
	const writes = await holdWrites(page);

	await island.getByRole('button', { name: 'Mark Kindred read from React' }).click();
	await expect(book(page, 'Kindred').getByRole('checkbox')).toBeChecked();
	await expect(island.getByText('Kindred')).toHaveCount(0);
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
