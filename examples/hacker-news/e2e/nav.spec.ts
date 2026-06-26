import { test, expect, type Page } from '@playwright/test';

// Navigation parity e2e. This ONE spec runs once per Playwright project (`jsx`
// on :5191, `tsrx` on :5192). The two apps share the whole octane core (router +
// query + suspense + stylex) and the shared view-model — only their view
// components differ. So identical assertions passing under both projects is the
// proof that the React-style `.tsx` views and the `.tsrx` directive views are
// observably equivalent.
//
// Every test is deterministic and offline: the HN Firebase API is stubbed via
// page.route() with tiny fixed fixtures, plus a small artificial delay so the
// Suspense skeleton/pending state is actually exercised before data resolves.

// --- Fixtures -------------------------------------------------------------

// Each feed endpoint (/v0/<feed>.json) returns a DISTINCT, fixed id list so the
// nav can be proven to actually swap feeds (not just navigate). The ids are
// disjoint per feed and map to the items below, so each feed shows a different,
// recognizable headline.
const TOP_IDS = [101, 102, 103];
const NEW_IDS = [301, 302];
const ASK_IDS = [401, 402, 403, 404];
const SHOW_IDS = [501];
const JOB_IDS = [601, 602, 603, 604, 605];

// The /v0/<feed>.json endpoints, keyed by request pathname.
const FEED_LISTS: Record<string, number[]> = {
	'/v0/topstories.json': TOP_IDS,
	'/v0/newstories.json': NEW_IDS,
	'/v0/askstories.json': ASK_IDS,
	'/v0/showstories.json': SHOW_IDS,
	'/v0/jobstories.json': JOB_IDS,
};

// A recognizable lead title per feed — used to prove the list content swapped.
const NEW_LEAD_TITLE = 'New: freshly submitted to octane';
const ASK_LEAD_TITLE = 'Ask HN: how does the LIS reconciler work?';
const SHOW_LEAD_TITLE = 'Show HN: octane hacker-news demo';
const JOBS_LEAD_TITLE = 'Octane is hiring compiler engineers';

// One story WITH an external url (so its title is an external link) and kids
// (comment ids). The other two round out the list.
const ITEMS: Record<number, unknown> = {
	101: {
		id: 101,
		type: 'story',
		by: 'alice',
		time: 1700000000,
		title: 'Octane: React parity, compiled ahead of time',
		url: 'https://example.com/octane',
		score: 256,
		descendants: 2,
		kids: [201, 202],
	},
	102: {
		id: 102,
		type: 'story',
		by: 'bob',
		time: 1700000100,
		title: 'Show HN: A tiny TSRX playground',
		url: 'https://github.com/octane/playground',
		score: 128,
		descendants: 0,
		kids: [],
	},
	103: {
		id: 103,
		type: 'story',
		by: 'carol',
		time: 1700000200,
		title: 'Ask HN: Favorite compiler tricks?',
		// No url -> title becomes an internal <Link> to /item/103.
		score: 64,
		descendants: 0,
		kids: [],
	},
	// Comments on story 101. Bodies are HTML (as the real HN API returns) bound
	// with innerHTML — now that that binding works, the body text renders.
	201: {
		id: 201,
		type: 'comment',
		by: 'dan',
		time: 1700000300,
		text: 'This is the <i>first</i> comment about octane.',
		kids: [],
		parent: 101,
	},
	202: {
		id: 202,
		type: 'comment',
		by: 'erin',
		time: 1700000400,
		text: 'And here is a second top-level comment.',
		kids: [],
		parent: 101,
	},
	// --- new feed (NEW_IDS) ---
	301: {
		id: 301,
		type: 'story',
		by: 'nina',
		time: 1700001000,
		title: NEW_LEAD_TITLE,
		url: 'https://example.com/new',
		score: 3,
		descendants: 0,
		kids: [],
	},
	302: {
		id: 302,
		type: 'story',
		by: 'ned',
		time: 1700001100,
		title: 'New: another fresh submission',
		score: 1,
		descendants: 0,
		kids: [],
	},
	// --- ask feed (ASK_IDS) ---
	401: {
		id: 401,
		type: 'story',
		by: 'amy',
		time: 1700002000,
		title: ASK_LEAD_TITLE,
		score: 42,
		descendants: 0,
		kids: [],
	},
	402: { id: 402, type: 'story', by: 'amy', time: 1700002100, title: 'Ask HN: two', score: 5 },
	403: { id: 403, type: 'story', by: 'amy', time: 1700002200, title: 'Ask HN: three', score: 6 },
	404: { id: 404, type: 'story', by: 'amy', time: 1700002300, title: 'Ask HN: four', score: 7 },
	// --- show feed (SHOW_IDS) ---
	501: {
		id: 501,
		type: 'story',
		by: 'sam',
		time: 1700003000,
		title: SHOW_LEAD_TITLE,
		url: 'https://example.com/show',
		score: 88,
		descendants: 0,
		kids: [],
	},
	// --- jobs feed (JOB_IDS) ---
	601: {
		id: 601,
		type: 'job',
		by: 'jobsbot',
		time: 1700004000,
		title: JOBS_LEAD_TITLE,
		url: 'https://example.com/jobs',
		score: 1,
	},
	602: { id: 602, type: 'job', by: 'jobsbot', time: 1700004100, title: 'Octane job two' },
	603: { id: 603, type: 'job', by: 'jobsbot', time: 1700004200, title: 'Octane job three' },
	604: { id: 604, type: 'job', by: 'jobsbot', time: 1700004300, title: 'Octane job four' },
	605: { id: 605, type: 'job', by: 'jobsbot', time: 1700004400, title: 'Octane job five' },
};

const USERS: Record<string, unknown> = {
	alice: {
		id: 'alice',
		created: 1500000000,
		karma: 4242,
		about: 'Maintainer of nothing in particular.',
	},
	dan: { id: 'dan', created: 1520000000, karma: 99 },
};

// --- Stubbing -------------------------------------------------------------

// Tiny delay so the pending/skeleton UI renders before data arrives.
const delay = () => new Promise((r) => setTimeout(r, 80));

/** Route every HN Firebase request to the fixtures above. */
async function stubHackerNews(page: Page) {
	await page.route('**/hacker-news.firebaseio.com/**', async (route) => {
		const path = new URL(route.request().url()).pathname; // e.g. /v0/item/101.json
		await delay();

		// Feed id lists: /v0/{top,new,ask,show,job}stories.json -> distinct ids.
		if (path in FEED_LISTS) {
			return route.fulfill({ json: FEED_LISTS[path] });
		}

		const itemMatch = path.match(/^\/v0\/item\/(\d+)\.json$/);
		if (itemMatch) {
			const item = ITEMS[Number(itemMatch[1])];
			return item ? route.fulfill({ json: item }) : route.fulfill({ json: null });
		}

		const userMatch = path.match(/^\/v0\/user\/([^/]+)\.json$/);
		if (userMatch) {
			const user = USERS[userMatch[1]];
			return user ? route.fulfill({ json: user }) : route.fulfill({ json: null });
		}

		return route.fulfill({ json: null });
	});
}

test.beforeEach(async ({ page }) => {
	await stubHackerNews(page);
});

// --- Tests ----------------------------------------------------------------

test('home renders the stubbed top stories', async ({ page }) => {
	await page.goto('/');

	const rows = page.getByTestId('story-row');
	await expect(rows).toHaveCount(TOP_IDS.length);

	// A known title is visible.
	await expect(page.getByText('Octane: React parity, compiled ahead of time')).toBeVisible();

	// The first story has a url, so its title is an external link pointing at the
	// stubbed href. (StyleX owns `className` on these anchors, so they're
	// addressed by role/href rather than a class — stable and identical in both
	// the .tsx and .tsrx apps.)
	const externalTitle = page.getByRole('link', {
		name: 'Octane: React parity, compiled ahead of time',
	});
	await expect(externalTitle).toHaveAttribute('href', 'https://example.com/octane');
});

test('the skeleton/pending state shows before data, then resolves to rows', async ({ page }) => {
	// Don't await the load — assert the pending skeleton appears first.
	const navigation = page.goto('/');

	// Route-level pending skeleton ([data-testid="pending"]) is shown while the
	// top-stories id list is still loading.
	await expect(page.getByTestId('pending')).toBeVisible();

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
	// about octane.`) bound via `innerHTML`; that binding now works, so the text
	// appears AND the inline <i> markup is set as real inner HTML (not escaped).
	await expect(firstComment).toContainText('first comment about octane');
	await expect(firstComment.locator('i')).toHaveText('first');
	// The second comment's plain-text body renders too.
	await expect(page.getByTestId('comment').nth(1)).toContainText('second top-level comment');

	// Browser Back returns to the list.
	await page.goBack();
	await expect(page).toHaveURL(/\/$|\/(\?.*)?$/);
	await expect(page.getByTestId('story-row')).toHaveCount(TOP_IDS.length);
});

test('clicking an author navigates to /user/:id and the karma renders', async ({ page }) => {
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
	const newLink = header.locator('a[href="/newest"]');
	const askLink = header.locator('a[href="/ask"]');

	// new -> /newest: URL, distinct new-feed content, and active marking.
	await newLink.click();
	await expect(page).toHaveURL(/\/newest$/);
	await expect(storiesPage).toHaveAttribute('data-feed', 'new');
	await expect(page.getByTestId('story-row')).toHaveCount(NEW_IDS.length);
	await expect(page.getByText(NEW_LEAD_TITLE)).toBeVisible();
	// Top-feed lead title is gone — the list genuinely swapped.
	await expect(page.getByText('Octane: React parity, compiled ahead of time')).toHaveCount(0);
	// The active link is marked by the router (aria-current/data-status) AND by
	// the visible headerLinkActive style (bold + underline).
	await expect(newLink).toHaveAttribute('aria-current', 'page');
	await expect(newLink).toHaveAttribute('data-status', 'active');
	await expect(newLink).toHaveCSS('font-weight', '700');
	await expect(newLink).toHaveCSS('text-decoration-line', 'underline');
	// A sibling feed link is NOT active.
	await expect(askLink).not.toHaveAttribute('aria-current', 'page');
	await expect(askLink).toHaveCSS('font-weight', '400');

	// ask -> /ask: URL, distinct ask-feed content, active swaps to ask.
	await askLink.click();
	await expect(page).toHaveURL(/\/ask$/);
	await expect(storiesPage).toHaveAttribute('data-feed', 'ask');
	await expect(page.getByTestId('story-row')).toHaveCount(ASK_IDS.length);
	await expect(page.getByText(ASK_LEAD_TITLE)).toBeVisible();
	await expect(askLink).toHaveAttribute('aria-current', 'page');
	await expect(askLink).toHaveCSS('font-weight', '700');
	// new is no longer active.
	await expect(newLink).not.toHaveAttribute('aria-current', 'page');
	await expect(newLink).toHaveCSS('font-weight', '400');
});
