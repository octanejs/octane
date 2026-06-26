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

// Ranked top-story ids returned by /v0/topstories.json.
const TOP_IDS = [101, 102, 103];

// One story WITH an external url (so its title is an `a.story-title` link) and
// kids (comment ids). The other two round out the list.
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
	// Comments on story 101.
	201: {
		id: 201,
		type: 'comment',
		by: 'dan',
		time: 1700000300,
		text: 'This is the first comment about octane.',
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

		if (path === '/v0/topstories.json') {
			return route.fulfill({ json: TOP_IDS });
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
	await expect(
		page.getByText('Octane: React parity, compiled ahead of time'),
	).toBeVisible();

	// The first story has a url, so its title is an external `a.story-title`.
	const externalTitle = page.locator('a.story-title', {
		hasText: 'Octane: React parity, compiled ahead of time',
	});
	await expect(externalTitle).toHaveAttribute(
		'href',
		'https://example.com/octane',
	);
});

test('the skeleton/pending state shows before data, then resolves to rows', async ({
	page,
}) => {
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

test('clicking a story comments link navigates to /item/:id and Back returns', async ({
	page,
}) => {
	await page.goto('/');
	await expect(page.getByTestId('story-row').first()).toBeVisible();

	// The first row (story 101) has 2 comments -> its comments-link.
	const firstRow = page.getByTestId('story-row').first();
	await firstRow.getByTestId('comments-link').click();

	await expect(page).toHaveURL(/\/item\/101/);

	// Story header + a known comment text render on the item page.
	await expect(page.getByTestId('item-page')).toBeVisible();
	await expect(
		page.getByRole('heading', {
			name: 'Octane: React parity, compiled ahead of time',
		}),
	).toBeVisible();
	await expect(
		page.getByText('This is the first comment about octane.'),
	).toBeVisible();
	await expect(page.getByTestId('comment')).toHaveCount(2);

	// Browser Back returns to the list.
	await page.goBack();
	await expect(page).toHaveURL(/\/$|\/(\?.*)?$/);
	await expect(page.getByTestId('story-row')).toHaveCount(TOP_IDS.length);
});

test('clicking an author navigates to /user/:id and the karma renders', async ({
	page,
}) => {
	await page.goto('/');
	await expect(page.getByTestId('story-row').first()).toBeVisible();

	// The first row's author is `alice`.
	const firstRow = page.getByTestId('story-row').first();
	await firstRow.getByTestId('user-link').click();

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

	for (const label of [
		'Y',
		'Hacker News',
		'new',
		'past',
		'comments',
		'ask',
		'show',
		'jobs',
		'submit',
	]) {
		await expect(
			header.getByRole('link', { name: label, exact: true }),
		).toBeVisible();
	}
});
