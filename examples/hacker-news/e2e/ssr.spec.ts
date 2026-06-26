import { test, expect, chromium, type Browser } from '@playwright/test';

// SSR proof. The mocked nav/feed/pagination specs run against the CLIENT-ONLY
// dev server (where `page.route()` can stub the HN Firebase API). This spec
// instead targets the dev SSR server for the TSRX app (`node server.mjs tsrx`, on
// :5194), which server-renders each route with its data resolved and dehydrated,
// then hydrates.
//
// The SSR server's fetches happen in Node, so Playwright can't stub them — this
// spec therefore uses LIVE Hacker News data and asserts PRESENCE (server-rendered
// rows exist), not exact stubbed counts.
//
// The key assertion uses a JavaScript-DISABLED context: with no client runtime to
// render anything, every [data-testid="story-row"] in the DOM came from the SERVER
// HTML — proving the page arrives server-rendered (not client-rendered).
//
// The .tsx app's SSR is blocked upstream (see the README "SSR & hydration" notes:
// `.tsx` boundaries are the `<Suspense>`/`<ErrorBoundary>` component forms, which
// the server compiler doesn't yet support — the TSRX app uses `@try`/`@pending`
// directives instead), so this spec runs for the tsrx project only.

// The TSRX SSR server.
const SSR_BASE = 'http://localhost:5194';

test.describe('SSR: rows arrive in the server HTML', () => {
	// Only the TSRX app has a working SSR server; skip under the jsx project.
	test.skip(({ baseURL }) => !baseURL?.endsWith('5192'), 'TSRX SSR server only');

	test('home story rows are present with JavaScript disabled (server-rendered)', async () => {
		// A fresh browser with JS turned OFF: nothing can client-render, so any rows
		// present came straight from the server's HTML response.
		const browser: Browser = await chromium.launch();
		const context = await browser.newContext({ javaScriptEnabled: false });
		try {
			const page = await context.newPage();
			await page.goto(SSR_BASE + '/', { waitUntil: 'domcontentloaded' });

			// The server-rendered stories list and ≥1 row are in the static HTML.
			await expect(page.getByTestId('stories-page')).toBeVisible();
			const rows = page.getByTestId('story-row');
			expect(await rows.count()).toBeGreaterThan(0);

			// The dehydrated query cache is inlined for the client to hydrate from.
			await expect(page.locator('#__octane_data')).toHaveCount(1);

			// The header chrome is server-rendered too (not a client-only shell).
			await expect(page.locator('header a[href="/newest"]')).toBeVisible();
		} finally {
			await context.close();
			await browser.close();
		}
	});

	test('the page hydrates and becomes interactive', async () => {
		const browser: Browser = await chromium.launch();
		const context = await browser.newContext(); // JS enabled
		try {
			const page = await context.newPage();
			await page.goto(SSR_BASE + '/', { waitUntil: 'networkidle' });

			// The server rows are adopted by hydration (still present after the client
			// runtime takes over).
			await expect(page.getByTestId('story-row').first()).toBeVisible();
			expect(await page.getByTestId('story-row').count()).toBeGreaterThan(0);

			// Interactive: a client-side feed navigation works post-hydration.
			await page.locator('header a[href="/newest"]').click();
			await expect(page).toHaveURL(/\/newest(\?page=1)?$/);
			await expect(page.getByTestId('stories-page')).toHaveAttribute('data-feed', 'new');
			expect(await page.getByTestId('story-row').count()).toBeGreaterThan(0);
		} finally {
			await context.close();
			await browser.close();
		}
	});

	test('navigating to an item page works (SSR + hydrate)', async () => {
		const browser: Browser = await chromium.launch();
		const context = await browser.newContext();
		try {
			const page = await context.newPage();
			await page.goto(SSR_BASE + '/', { waitUntil: 'networkidle' });
			await expect(page.getByTestId('story-row').first()).toBeVisible();

			// Follow the first row's comments link to its /item/:id page.
			const link = page.getByTestId('story-row').first().locator('a[href^="/item/"]').first();
			const href = await link.getAttribute('href');
			await link.click();
			await expect(page).toHaveURL(new RegExp(href!.replace(/\//g, '\\/')));
			await expect(page.getByTestId('item-page')).toBeVisible();
		} finally {
			await context.close();
			await browser.close();
		}
	});
});
