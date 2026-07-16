import { test, expect } from './test.ts';
import fixture from './fixtures/hacker-news.json' with { type: 'json' };

// SSR proof. The nav/feed/pagination specs run against the client-only Vite
// servers. This spec targets the source-driven SSR servers (`node server.mjs
// <app>`) under production runtime semantics; they render each route with its
// data resolved and dehydrated, then hydrate.
//
// Browser and Node SSR requests both use the local fixture API, so this suite is
// deterministic and works without network access. Exact fixture content can be
// asserted on both sides of hydration.
//
// BOTH apps SSR — the React-style `.tsx` app (SSR on :5193) and the TSRX app (SSR on
// :5194) over the same octane core — so this spec runs once per project. The SAME
// assertions passing under both IS the .tsx ≡ .tsrx SSR-parity proof. The SSR base is
// the project's client port + 2 (5191 → 5193, 5192 → 5194).

function ssrBase(baseURL: string | undefined): string {
	const port = Number(new URL(baseURL ?? 'http://localhost:5191').port);
	return `http://localhost:${port + 2}`;
}

const FIRST_PAGE_SIZE = 30;
const LEAD_TITLE = fixture.items['101'].title;

test.describe('SSR: rows arrive in the server HTML without JavaScript', () => {
	test.use({ browserDiagnostics: false });

	test('home story rows are present with JavaScript disabled (server-rendered)', async ({
		baseURL,
		browser,
	}) => {
		const SSR_BASE = ssrBase(baseURL);
		// A fresh browser with JS turned OFF: nothing can client-render, so any rows
		// present came straight from the server's HTML response.
		const context = await browser.newContext({ javaScriptEnabled: false });
		try {
			const page = await context.newPage();
			await page.goto(SSR_BASE + '/', { waitUntil: 'domcontentloaded' });

			// The exact first fixture page is present in the static HTML.
			await expect(page.getByTestId('stories-page')).toBeVisible();
			const rows = page.getByTestId('story-row');
			await expect(rows).toHaveCount(FIRST_PAGE_SIZE);
			const leadTitle = page.getByRole('link', { name: LEAD_TITLE });
			await expect(leadTitle).toHaveAttribute('href', 'https://example.com/octane');
			// This anchor has a literal class followed by a StyleX spread. Its
			// computed first-paint style proves SSR kept the spread's effective class;
			// production hydration cannot silently repair a missing server class here.
			await expect(leadTitle).toHaveCSS('font-size', '14px');
			await expect(leadTitle).toHaveCSS('text-decoration-line', 'none');

			// The header chrome is server-rendered too (not a client-only shell).
			await expect(page.locator('header a[href="/newest"]')).toBeVisible();

			// First paint is STYLED — the StyleX sheet is inlined into the SSR <head>,
			// so the page isn't a flash of unstyled content (the `<main>` carries the
			// beige HN feed background even with JS disabled).
			await expect(page.locator('main')).toHaveCSS('background-color', 'rgb(246, 246, 239)');
		} finally {
			await context.close();
		}
	});
});

test.describe('SSR: server rows hydrate and become interactive', () => {
	test('the page adopts server rows cleanly and becomes interactive', async ({ baseURL, page }) => {
		const SSR_BASE = ssrBase(baseURL);
		await page.addInitScript(() => {
			const probe = globalThis as typeof globalThis & { e2eServerFirstStory?: Element };
			const observer = new MutationObserver(() => {
				probe.e2eServerFirstStory ??=
					document.querySelector('[data-testid="story-row"]') ?? undefined;
			});
			observer.observe(document, { childList: true, subtree: true });
		});

		await page.goto(SSR_BASE + '/', { waitUntil: 'networkidle' });

		// Hydration preserves the server-created lead row instead of replacing it.
		await expect(page.getByTestId('story-row').first()).toBeVisible();
		await expect(page.getByTestId('story-row')).toHaveCount(FIRST_PAGE_SIZE);
		const adoptedServerRow = await page.evaluate(() => {
			const probe = globalThis as typeof globalThis & { e2eServerFirstStory?: Element };
			return probe.e2eServerFirstStory === document.querySelector('[data-testid="story-row"]');
		});
		expect(adoptedServerRow).toBe(true);

		// Interactive: a client-side feed navigation works post-hydration. The
		// router holds the current page in a transition until the next feed's data
		// resolves, so `toHaveAttribute` (auto-retrying) waits for the swap.
		await page.locator('header a[href="/newest"]').click();
		await expect(page).toHaveURL(/\/newest(\?page=1)?$/);
		await expect(page.getByTestId('stories-page')).toHaveAttribute('data-feed', 'new');
		await expect(page.getByTestId('story-row')).toHaveCount(fixture.feeds.new.length);
		await expect(page.getByText(fixture.items['301'].title)).toBeVisible();
	});

	test('navigating to an item page works after hydration', async ({ baseURL, page }) => {
		const SSR_BASE = ssrBase(baseURL);
		await page.goto(SSR_BASE + '/', { waitUntil: 'networkidle' });
		await expect(page.getByTestId('story-row').first()).toBeVisible();

		// Follow the known lead story's comments link.
		await page.getByTestId('story-row').first().locator('a[href="/item/101"]').click();
		await expect(page).toHaveURL(/\/item\/101$/);
		await expect(page.getByTestId('item-page')).toBeVisible();
		await expect(page.getByRole('heading', { name: LEAD_TITLE })).toBeVisible();
		await expect(page.getByTestId('comment')).toHaveCount(2);
	});
});
