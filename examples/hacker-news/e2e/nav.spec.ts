import { test, expect } from './test.ts';
import fixture from './fixtures/hacker-news.json' with { type: 'json' };

// Navigation parity e2e. This ONE spec runs once per Playwright project (`jsx`
// on :5191, `tsrx` on :5192). The two apps share the whole octane core (router +
// query + suspense + stylex) and the shared view-model — only their view
// components differ. So identical assertions passing under both projects is the
// proof that the React-style `.tsx` views and the `.tsrx` directive views are
// observably equivalent.
//
// Every test is deterministic and offline: browser and SSR requests use the
// local HN-compatible fixture API started by playwright.config.ts. Its small
// response delay also makes the Suspense pending state observable.

// --- Fixtures -------------------------------------------------------------

// The top feed has two pages; this spec validates the first one while the
// pagination contract has its own focused journey.
const TOP_IDS = fixture.feeds.top.slice(0, 30);
const FEED_CASES = [
	{
		href: '/newest',
		url: /\/newest(\?page=1)?$/,
		feed: 'new',
		ids: fixture.feeds.new,
		leadTitle: fixture.items['301'].title,
	},
	{
		href: '/ask',
		url: /\/ask(\?page=1)?$/,
		feed: 'ask',
		ids: fixture.feeds.ask,
		leadTitle: fixture.items['401'].title,
	},
	{
		href: '/show',
		url: /\/show(\?page=1)?$/,
		feed: 'show',
		ids: fixture.feeds.show,
		leadTitle: fixture.items['501'].title,
	},
	{
		href: '/jobs',
		url: /\/jobs(\?page=1)?$/,
		feed: 'jobs',
		ids: fixture.feeds.jobs,
		leadTitle: fixture.items['601'].title,
	},
] as const;

// --- Tests ----------------------------------------------------------------

test('home renders the fixture top stories', async ({ page }) => {
	await page.goto('/');

	const rows = page.getByTestId('story-row');
	await expect(rows).toHaveCount(TOP_IDS.length);

	// A known title is visible.
	await expect(page.getByText('Octane: React parity, compiled ahead of time')).toBeVisible();

	// The first story has a url, so its title is an external link pointing at the
	// fixture href. (StyleX owns `className` on these anchors, so they're
	// addressed by role/href rather than a class — stable and identical in both
	// the .tsx and .tsrx apps.)
	const externalTitle = page.getByRole('link', {
		name: 'Octane: React parity, compiled ahead of time',
	});
	await expect(externalTitle).toHaveAttribute('href', 'https://example.com/octane');
});

test('the skeleton/pending state shows before data, then resolves to rows', async ({ page }) => {
	// Hold the feed response until the fallback is observed. This makes the
	// assertion scheduling-independent instead of relying on a short fixed delay.
	let releaseFeed!: () => void;
	const feedGate = new Promise<void>((resolve) => {
		releaseFeed = resolve;
	});
	await page.route('**/v0/topstories.json', async (route) => {
		await feedGate;
		await route.continue();
	});

	// Don't await the load — assert the pending skeleton appears first.
	const navigation = page.goto('/');

	// Route-level pending skeleton ([data-testid="pending"]) is shown while the
	// top-stories id list is still loading.
	try {
		await expect(page.getByTestId('pending')).toBeVisible();
	} finally {
		releaseFeed();
	}

	await navigation;

	// Once data resolves, the rows replace the skeleton.
	await expect(page.getByTestId('story-row').first()).toBeVisible();
	await expect(page.getByTestId('story-row')).toHaveCount(TOP_IDS.length);
});

test('clicking a story comments link navigates to /item/:id and Back returns', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('story-row').first()).toBeVisible();

	// The first row (story 101) has an external title, so its only /item/101
	// link is the "2 comments" link. (Router <Link>s render plain <a href>s, so
	// the comments link is addressed by its href — identical in both apps.)
	const firstRow = page.getByTestId('story-row').first();
	await firstRow.locator('a[href="/item/101"]').click();

	await expect(page).toHaveURL(/\/item\/101/);

	// The item page renders: the story header (an <h1> heading carrying the
	// title) plus the story's two comments.
	await expect(page.getByTestId('item-page')).toBeVisible();
	await expect(
		page.getByRole('heading', {
			name: /Octane: React parity, compiled ahead of time/,
		}),
	).toBeVisible();
	await expect(page.getByTestId('comment')).toHaveCount(2);

	const firstComment = page.getByTestId('comment').first();
	// The first comment is authored by `dan` -> a /user/dan link inside it.
	await expect(firstComment.locator('a[href="/user/dan"]')).toHaveText('dan');

	// Comment BODY renders. The body is HTML (`This is the <i>first</i> comment
	// about octane.`) bound through the public `dangerouslySetInnerHTML` prop, so
	// the text appears AND the inline <i> markup is real HTML (not escaped).
	await expect(firstComment).toContainText('first comment about octane');
	await expect(firstComment.locator('i')).toHaveText('first');
	// The second comment's plain-text body renders too.
	await expect(page.getByTestId('comment').nth(1)).toContainText('second top-level comment');

	// Browser Back returns to the list.
	await page.goBack();
	await expect(page).toHaveURL(/\/$|\/(\?.*)?$/);
	await expect(page.getByTestId('story-row')).toHaveCount(TOP_IDS.length);
});

test('clicking an author renders the complete user profile', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('story-row').first()).toBeVisible();

	// The first row's author is `alice` -> its /user/alice link.
	const firstRow = page.getByTestId('story-row').first();
	await firstRow.locator('a[href="/user/alice"]').click();

	await expect(page).toHaveURL(/\/user\/alice/);
	await expect(page.getByTestId('user-page')).toBeVisible();

	// Karma is rendered (alice -> 4242).
	await expect(page.getByText('karma:')).toBeVisible();
	await expect(page.getByText('4242')).toBeVisible();
	await expect(page.getByText('about:')).toBeVisible();
	await expect(page.getByText('Maintainer of nothing in particular.')).toBeVisible();
	await expect(page.getByTestId('user-page').locator('strong')).toHaveText('nothing');
});

test('the header nav links are present', async ({ page }) => {
	await page.goto('/');

	const header = page.locator('header');
	await expect(header).toBeVisible();

	for (const label of ['Y', 'Hacker News', 'new', 'ask', 'show', 'jobs']) {
		await expect(header.getByRole('link', { name: label, exact: true })).toBeVisible();
	}
});

test('the feed nav links swap the feed, its content, and the active highlight', async ({
	page,
}) => {
	await page.goto('/');
	await expect(page.getByTestId('story-row').first()).toBeVisible();

	// Start on the top feed: top content, top id count, nothing active.
	const storiesPage = page.getByTestId('stories-page');
	await expect(storiesPage).toHaveAttribute('data-feed', 'top');
	await expect(page.getByTestId('story-row')).toHaveCount(TOP_IDS.length);

	// The header feed links render as plain <a href> (the router <Link> drops
	// data-testid), so address them by href.
	const header = page.locator('header');
	for (const feedCase of FEED_CASES) {
		const activeLink = header.locator(`a[href="${feedCase.href}"]`);

		// Every feed route must swap URL, content, row count, and active state.
		// The router may normalize the default page into `?page=1`.
		await activeLink.click();
		await expect(page).toHaveURL(feedCase.url);
		await expect(storiesPage).toHaveAttribute('data-feed', feedCase.feed);
		await expect(page.getByTestId('story-row')).toHaveCount(feedCase.ids.length);
		await expect(page.getByText(feedCase.leadTitle)).toBeVisible();
		await expect(activeLink).toHaveAttribute('aria-current', 'page');
		await expect(activeLink).toHaveAttribute('data-status', 'active');
		await expect(activeLink).toHaveCSS('font-weight', '700');
		await expect(activeLink).toHaveCSS('text-decoration-line', 'underline');

		for (const siblingCase of FEED_CASES) {
			if (siblingCase === feedCase) continue;
			const siblingLink = header.locator(`a[href="${siblingCase.href}"]`);
			await expect(siblingLink).not.toHaveAttribute('aria-current', 'page');
			await expect(siblingLink).toHaveCSS('font-weight', '400');
		}
	}

	// The final jobs feed is genuinely distinct from the original top list.
	await expect(page.getByText('Octane: React parity, compiled ahead of time')).toHaveCount(0);
});
