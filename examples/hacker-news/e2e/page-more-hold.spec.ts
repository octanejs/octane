import { test, expect, type Page } from '@playwright/test';

// Phase-2 independent browser verification of the transition-held /
// urgent-resuspend fix, through the REAL useSuspenseQuery + router concurrent
// navigation path. A top feed of 60 ids = two pages of 30. Page 1 commits;
// clicking "more ›" starts a router navigation transition that re-suspends
// StoriesPage on the page-2 batch query. The query observer notifies on a
// setTimeout(0) macrotask AFTER the transition window has closed, so the
// re-suspend re-render is URGENT — pre-fix this flashed the 30-row skeleton.
// React (and now octane) HOLDS the 30 page-1 rows until page 2 is ready.

const PAGE_SIZE = 30;
const TOP_IDS = Array.from({ length: 60 }, (_, i) => 1000 + i); // 1000..1059

function makeStory(id: number) {
	return {
		id,
		type: 'story',
		by: 'user' + id,
		time: 1700000000 + id,
		title: 'Story #' + id,
		url: 'https://example.com/' + id,
		score: id,
		descendants: 0,
		kids: [],
	};
}

// A larger artificial delay so the in-flight window is wide enough to sample.
const ITEM_DELAY_MS = 600;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function stubHackerNews(page: Page) {
	await page.route('**/hacker-news.firebaseio.com/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		const itemMatch = path.match(/^\/v0\/item\/(\d+)\.json$/);
		if (path === '/v0/topstories.json') {
			await delay(80);
			return route.fulfill({ json: TOP_IDS });
		}
		if (itemMatch) {
			// Item fetches are the page batch — delay them so the page-2 batch query
			// stays in flight long enough to observe the hold.
			await delay(ITEM_DELAY_MS);
			return route.fulfill({ json: makeStory(Number(itemMatch[1])) });
		}
		return route.fulfill({ json: null });
	});
}

test('clicking "more ›" HOLDS the page-1 rows (no skeleton flash) until page 2 resolves', async ({
	page,
}) => {
	await stubHackerNews(page);
	await page.goto('/');

	// Page 1: exactly 30 rows, first title is Story #1000.
	await expect(page.getByTestId('story-row')).toHaveCount(PAGE_SIZE);
	const firstTitleP1 = await page.getByTestId('story-row').first().textContent();
	expect(firstTitleP1).toContain('Story #1000');
	await expect(page.getByTestId('page-indicator')).toHaveText('page 1');
	await expect(page.getByTestId('row-skeleton')).toHaveCount(0);

	// Click "more ›" but DON'T await navigation — sample the DOM during the
	// in-flight window. Begin sampling immediately.
	const samples: Array<{ rows: number; skeletons: number; firstTitle: string | null }> = [];
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
			samples.push({ rows, skeletons, firstTitle });
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
	//  - the page-1 first title (Story #1000) stayed visible until the swap.
	const minRows = Math.min(...samples.map((s) => s.rows).filter((n) => n >= 0));
	const maxSkeletons = Math.max(...samples.map((s) => s.skeletons).filter((n) => n >= 0), 0);
	const everSawSkeleton = samples.some((s) => s.skeletons > 0);
	const heldFirstTitle = samples.some((s) => s.firstTitle?.includes('Story #1000'));

	expect(
		minRows,
		'story-row count must never drop below 30 during the move',
	).toBeGreaterThanOrEqual(PAGE_SIZE);
	expect(maxSkeletons, 'row-skeleton must never appear during the move').toBe(0);
	expect(everSawSkeleton, 'the @pending skeleton must never flash').toBe(false);
	expect(heldFirstTitle, 'page-1 first title (Story #1000) must stay visible while held').toBe(
		true,
	);

	// Final state: page 2, 30 rows, Story #1030 first.
	await expect(page.getByTestId('story-row')).toHaveCount(PAGE_SIZE);
	await expect(page.getByTestId('story-row').first()).toContainText('Story #1030');
	await expect(page.getByTestId('row-skeleton')).toHaveCount(0);
});
