import { test, expect, chromium, type Browser } from '@playwright/test';

// SSR proof. The mocked nav/feed/pagination specs run against the CLIENT-ONLY dev
// servers (where `page.route()` can stub the HN Firebase API). This spec instead
// targets the dev SSR servers (`node server.mjs <app>`), which server-render each
// route with its data resolved and dehydrated, then hydrate.
//
// The SSR servers' fetches happen in Node, so Playwright can't stub them — this spec
// therefore uses LIVE Hacker News data and asserts PRESENCE (server-rendered rows
// exist), not exact stubbed counts.
//
// BOTH apps SSR — the React-style `.tsx` app (SSR on :5193) and the TSRX app (SSR on
// :5194) over the same octane core — so this spec runs once per project. The SAME
// assertions passing under both IS the .tsx ≡ .tsrx SSR-parity proof. The SSR base is
// the project's client port + 2 (5191 → 5193, 5192 → 5194).

function ssrBase(baseURL: string | undefined): string {
	const port = Number(new URL(baseURL ?? 'http://localhost:5191').port);
	return `http://localhost:${port + 2}`;
}

test.describe('SSR: rows arrive in the server HTML, then hydrate', () => {
	test('home story rows are present with JavaScript disabled (server-rendered)', async ({
		baseURL,
	}) => {
		const SSR_BASE = ssrBase(baseURL);
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

			// First paint is STYLED — the StyleX sheet is inlined into the SSR <head>,
			// so the page isn't a flash of unstyled content (the `<main>` carries the
			// beige HN feed background even with JS disabled).
			await expect(page.locator('main')).toHaveCSS('background-color', 'rgb(246, 246, 239)');
		} finally {
			await context.close();
			await browser.close();
		}
	});

	test('the page hydrates cleanly and becomes interactive', async ({ baseURL }) => {
		const SSR_BASE = ssrBase(baseURL);
		const browser: Browser = await chromium.launch();
		const context = await browser.newContext(); // JS enabled
		try {
			const page = await context.newPage();
			// A desynced hydration cursor surfaces as a console.error from a boundary
			// (`… setAttribute is not a function`) and DOUBLES the rows — catch both.
			const consoleErrors: string[] = [];
			page.on('console', (m) => {
				if (m.type() === 'error') consoleErrors.push(m.text());
			});
			await page.goto(SSR_BASE + '/', { waitUntil: 'networkidle' });
			await page.waitForTimeout(500);

			// The server rows are ADOPTED by hydration (still present, NOT doubled).
			await expect(page.getByTestId('story-row').first()).toBeVisible();
			expect(await page.getByTestId('story-row').count()).toBe(30);
			expect(consoleErrors).toEqual([]);

			// Interactive: a client-side feed navigation works post-hydration. The
			// router holds the current page in a transition until the next feed's data
			// resolves, so `toHaveAttribute` (auto-retrying) waits for the swap.
			await page.locator('header a[href="/newest"]').click();
			await expect(page).toHaveURL(/\/newest(\?page=1)?$/);
			await expect(page.getByTestId('stories-page')).toHaveAttribute('data-feed', 'new');
			expect(await page.getByTestId('story-row').count()).toBeGreaterThan(0);
		} finally {
			await context.close();
			await browser.close();
		}
	});

	test('navigating to an item page works (SSR + hydrate)', async ({ baseURL }) => {
		const SSR_BASE = ssrBase(baseURL);
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
