import type { Page } from '@playwright/test';
import { test, expect } from './test.ts';
import fixture from './fixtures/hacker-news.json' with { type: 'json' };

// Pagination runs through the real router + useSuspenseQuery path. The second
// fixture page is deliberately slow so the browser can verify the user-facing
// contract: the current stories stay visible and no fallback flashes while the
// next page loads.

const PAGE_SIZE = 30;
const TOP_IDS = fixture.feeds.top;
const SECOND_PAGE_IDS = new Set(TOP_IDS.slice(PAGE_SIZE));
const FIRST_PAGE_TITLE = fixture.items['101'].title;

// A larger artificial delay so the in-flight window is wide enough to sample.
const ITEM_DELAY_MS = 600;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function delaySecondPage(page: Page) {
	await page.route('**/v0/item/*.json', async (route) => {
		const path = new URL(route.request().url()).pathname;
		const itemMatch = path.match(/^\/v0\/item\/(\d+)\.json$/);
		if (itemMatch && SECOND_PAGE_IDS.has(Number(itemMatch[1]))) {
			await delay(ITEM_DELAY_MS);
		}
		await route.continue();
	});
}

test('pagination keeps page-1 stories visible without a skeleton flash', async ({ page }) => {
	await delaySecondPage(page);
	await page.goto('/');

	// Page 1: exactly 30 rows with the recognizable lead fixture story.
	await expect(page.getByTestId('story-row')).toHaveCount(PAGE_SIZE);
	const firstTitleP1 = await page.getByTestId('story-row').first().textContent();
	expect(firstTitleP1).toContain(FIRST_PAGE_TITLE);
	await expect(page.getByTestId('page-indicator')).toHaveText('page 1');
	await expect(page.getByTestId('row-skeleton')).toHaveCount(0);

	// Click "more ›" but DON'T await navigation — sample the DOM during the
	// in-flight window. Begin sampling immediately.
	const samples: Array<{
		rows: number;
		skeletons: number;
		firstTitle: string | null;
		pageIndicator: string | null;
	}> = [];
	let sampling = true;
	const sampler = (async () => {
		while (sampling) {
			const rows = await page
				.getByTestId('story-row')
				.count()
				.catch(() => -1);
			const skeletons = await page
				.getByTestId('row-skeleton')
				.count()
				.catch(() => -1);
			const firstTitle = await page
				.getByTestId('story-row')
				.first()
				.textContent()
				.catch(() => null);
			const pageIndicator = await page
				.getByTestId('page-indicator')
				.textContent()
				.catch(() => null);
			samples.push({ rows, skeletons, firstTitle, pageIndicator });
			await delay(40);
		}
	})();

	await page.getByTestId('page-more').click();

	// Wait until page 2 has resolved (indicator flips to "page 2" and first row is
	// Story #1030). The batch delay (600ms) keeps us in the in-flight window long
	// enough to gather many samples first.
	await expect(page.getByTestId('page-indicator')).toHaveText('page 2', { timeout: 10_000 });
	await expect(page.getByTestId('story-row').first()).toContainText('Story #1030');

	sampling = false;
	await sampler;

	// Across the WHOLE in-flight window:
	//  - story-row count never dropped below 30 (page-1 rows HELD, never torn down).
	//  - the row skeleton NEVER appeared (no fallback flash).
	//  - the page-1 first title stayed visible until the swap.
	const minRows = Math.min(...samples.map((s) => s.rows).filter((n) => n >= 0));
	const maxSkeletons = Math.max(...samples.map((s) => s.skeletons).filter((n) => n >= 0), 0);
	const everSawSkeleton = samples.some((s) => s.skeletons > 0);
	const pageOneSamples = samples.filter((s) => s.pageIndicator?.includes('page 1'));

	expect(
		minRows,
		'story-row count must never drop below 30 during the page load',
	).toBeGreaterThanOrEqual(PAGE_SIZE);
	expect(maxSkeletons, 'row-skeleton must never appear during the page load').toBe(0);
	expect(everSawSkeleton, 'the @pending skeleton must never flash').toBe(false);
	expect(
		pageOneSamples.length,
		'the delayed request must expose the in-flight page',
	).toBeGreaterThan(0);
	expect(
		pageOneSamples.every((sample) => sample.firstTitle?.includes(FIRST_PAGE_TITLE)),
		'page-1 lead story must stay visible throughout the in-flight page',
	).toBe(true);

	// Final state: page 2, 30 rows, Story #1030 first.
	await expect(page.getByTestId('story-row')).toHaveCount(PAGE_SIZE);
	await expect(page.getByTestId('story-row').first()).toContainText('Story #1030');
	await expect(page.getByTestId('row-skeleton')).toHaveCount(0);
});
