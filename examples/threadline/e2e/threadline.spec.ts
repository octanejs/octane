import { expect, test, type Locator, type Page } from '@playwright/test';
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

async function openReadyHome(page: Page): Promise<void> {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Home timeline' })).toBeVisible();
	await expect(page.getByRole('article', { name: 'Post by Maya Chen' }).first()).toBeVisible();
}

function reaction(page: Page, author: string): Locator {
	return page.getByRole('button', { name: `Reaction to post by ${author}` }).first();
}

test('deep links through profiles, saved posts, and an intentional empty state', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/profile/maya');
	await expect(page).toHaveURL(/\/profile\/maya$/);
	await expect(page.getByRole('heading', { name: 'Maya Chen' })).toBeVisible();
	await expect(page.getByRole('article', { name: 'Post by Maya Chen' })).toHaveCount(2);
	const follow = page.getByRole('button', { name: 'Follow Maya Chen' });
	await follow.click();
	await expect(page.getByRole('button', { name: 'Unfollow Maya Chen' })).toHaveAttribute(
		'aria-pressed',
		'true',
	);

	const mobileNetwork = page.getByRole('button', { name: 'Work offline' });
	await expect(mobileNetwork).toBeVisible();
	await mobileNetwork.click();
	await expect(page.getByRole('button', { name: 'Reconnect' })).toBeVisible();
	await page.getByRole('button', { name: 'Reconnect' }).click();

	const mobileNavigation = page.getByRole('navigation', { name: 'Mobile navigation' });
	await mobileNavigation.getByRole('link', { name: 'Saved' }).click();
	await expect(page).toHaveURL(/\/saved$/);
	await expect(mobileNavigation.getByRole('link', { name: 'Saved' })).toHaveAttribute(
		'aria-current',
		'page',
	);
	await expect(page.getByRole('region', { name: 'Saved posts' }).getByRole('article')).toHaveCount(
		2,
	);

	await page.goto('/profile/rowan');
	await expect(page.getByRole('heading', { name: 'Rowan Ellis' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Rowan Ellis has not posted yet' })).toBeVisible();
	await expect(
		page.getByText('This quiet timeline is ready for their first update.'),
	).toBeVisible();
});

test('keyed prepends preserve a survivor and the live composer state', async ({ page }) => {
	await openReadyHome(page);
	const composer = page.getByRole('textbox', { name: 'What would you like to share?' });
	const mayaPost = page.getByRole('article', { name: 'Post by Maya Chen' }).first();
	const survivorBefore = await mayaPost.elementHandle();
	if (survivorBefore === null) throw new Error('expected the seeded Maya post');

	await composer.fill('A draft that must survive a live prepend');
	await expect(composer).toBeFocused();
	await composer.press('Alt+R');

	await expect(page.getByRole('article', { name: 'Post by Lena Ortiz' })).toBeVisible();
	await expect(composer).toHaveValue('A draft that must survive a live prepend');
	await expect(composer).toBeFocused();
	const survivorAfter = await mayaPost.elementHandle();
	if (survivorAfter === null) throw new Error('expected the Maya post after prepend');
	const sameNode = await page.evaluate(
		([before, after]) => before === after,
		[survivorBefore, survivorAfter],
	);
	expect(sameNode).toBe(true);

	await composer.press('ControlOrMeta+Enter');
	const published = page.getByRole('article', { name: 'Post by Avery Stone' }).first();
	await expect(published).toContainText('A draft that must survive a live prepend');
	await expect(published).toContainText('Sending…');
	await expect(composer).toHaveValue('');
	await expect(composer).toBeFocused();
	await expect(published).toContainText('Published');
});

test('offline posts and concurrent likes all remain retryable after reconnecting', async ({
	page,
}) => {
	await openReadyHome(page);
	const network = page.getByRole('button', { name: 'Work offline' });
	const composer = page.getByRole('textbox', { name: 'What would you like to share?' });
	const firstDraft = 'Keep this retryable when the network drops';
	const secondDraft = 'Preserve this second failed draft independently';

	await network.click();
	await expect(page.getByText('You’re offline.')).toBeVisible();
	await composer.fill(firstDraft);
	await composer.press('ControlOrMeta+Enter');
	await composer.fill(secondDraft);
	await composer.press('ControlOrMeta+Enter');
	const optimisticPosts = page.getByRole('article', { name: 'Post by Avery Stone' });
	await expect(optimisticPosts.filter({ hasText: firstDraft })).toContainText('Sending…');
	await expect(optimisticPosts.filter({ hasText: secondDraft })).toContainText('Sending…');

	const firstFailure = page
		.getByRole('alert')
		.filter({ hasText: `Post rolled back: “${firstDraft}”` });
	const secondFailure = page
		.getByRole('alert')
		.filter({ hasText: `Post rolled back: “${secondDraft}”` });
	await expect(firstFailure).toBeVisible();
	await expect(secondFailure).toBeVisible();
	await expect(optimisticPosts.filter({ hasText: firstDraft })).toHaveCount(0);
	await expect(optimisticPosts.filter({ hasText: secondDraft })).toHaveCount(0);
	const firstRetry = firstFailure.getByRole('button', {
		name: `Retry Post rolled back: “${firstDraft}”`,
	});
	const secondRetry = secondFailure.getByRole('button', {
		name: `Retry Post rolled back: “${secondDraft}”`,
	});
	await expect(firstRetry).toBeVisible();
	await expect(secondRetry).toBeVisible();
	await page.getByRole('button', { name: 'Reconnect' }).click();
	await firstRetry.click();
	await secondRetry.click();
	await expect(optimisticPosts.filter({ hasText: firstDraft })).toContainText('Published');
	await expect(optimisticPosts.filter({ hasText: secondDraft })).toContainText('Published');

	await page.getByRole('button', { name: 'Work offline' }).click();
	const mayaReaction = reaction(page, 'Maya Chen');
	const kaiReaction = reaction(page, 'Kai Bell');
	await expect(mayaReaction).toContainText('84');
	await mayaReaction.click();
	await kaiReaction.click();
	await expect(mayaReaction).toHaveAttribute('aria-pressed', 'true');
	await expect(kaiReaction).toHaveAttribute('aria-pressed', 'true');
	await expect(mayaReaction).toContainText('85');
	await expect(kaiReaction).toContainText('62');

	const mayaFailure = page.getByRole('alert').filter({ hasText: 'Maya Chen reaction rolled back' });
	const kaiFailure = page.getByRole('alert').filter({ hasText: 'Kai Bell reaction rolled back' });
	await expect(mayaFailure).toBeVisible();
	await expect(kaiFailure).toBeVisible();
	await expect(mayaReaction).toHaveAttribute('aria-pressed', 'false');
	await expect(kaiReaction).toHaveAttribute('aria-pressed', 'false');
	await expect(mayaReaction).toContainText('84');
	await expect(kaiReaction).toContainText('61');
	await page.getByRole('button', { name: 'Reconnect' }).click();
	await mayaFailure.getByRole('button', { name: 'Retry Maya Chen reaction rolled back' }).click();
	await kaiFailure.getByRole('button', { name: 'Retry Kai Bell reaction rolled back' }).click();
	await expect(mayaReaction).toHaveAttribute('aria-busy', 'false');
	await expect(kaiReaction).toHaveAttribute('aria-busy', 'false');
	await expect(mayaReaction).toHaveAttribute('aria-pressed', 'true');
	await expect(kaiReaction).toHaveAttribute('aria-pressed', 'true');
	await expect(mayaReaction).toContainText('85');
	await expect(kaiReaction).toContainText('62');

	// A newer explicit reaction supersedes its old failure. The stale Retry must
	// disappear rather than toggling a later successful result back again.
	await page.getByRole('button', { name: 'Work offline' }).click();
	await mayaReaction.click();
	const staleMayaFailure = page
		.getByRole('alert')
		.filter({ hasText: 'Maya Chen reaction rolled back' });
	await expect(staleMayaFailure).toBeVisible();
	await expect(mayaReaction).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('button', { name: 'Reconnect' }).click();
	await mayaReaction.click();
	await expect(staleMayaFailure).toBeHidden();
	await expect(mayaReaction).toHaveAttribute('aria-busy', 'false');
	await expect(mayaReaction).toHaveAttribute('aria-pressed', 'false');
	await expect(mayaReaction).toContainText('84');
});

test('rapid optimistic likes settle when acknowledgements arrive out of order', async ({
	page,
}) => {
	await page.setViewportSize({ width: 800, height: 900 });
	await openReadyHome(page);
	const primary = page.getByRole('navigation', { name: 'Primary navigation' });
	await expect(primary.getByRole('link', { name: 'Home' })).toBeVisible();
	await expect(primary.getByRole('link', { name: 'Saved' })).toBeVisible();
	await expect(primary.getByRole('link', { name: 'Profile' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Work offline' })).toBeVisible();
	const mayaReaction = reaction(page, 'Maya Chen');
	const kaiReaction = reaction(page, 'Kai Bell');

	await mayaReaction.click();
	await kaiReaction.click();
	await mayaReaction.click();
	await expect(mayaReaction).toHaveAttribute('aria-busy', 'true');
	await expect(kaiReaction).toHaveAttribute('aria-busy', 'true');
	await expect(mayaReaction).toContainText('84');
	await expect(kaiReaction).toContainText('62');

	await expect(kaiReaction).toHaveAttribute('aria-busy', 'false');
	await expect(mayaReaction).toHaveAttribute('aria-busy', 'true');
	await expect(mayaReaction).toHaveAttribute('aria-busy', 'false');
	await expect(mayaReaction).toHaveAttribute('aria-pressed', 'false');
	await expect(mayaReaction).toContainText('84');
	await expect(kaiReaction).toHaveAttribute('aria-pressed', 'true');
});

test('retains an optimistic publish across initial load failure and seed recovery', async ({
	page,
}) => {
	await page.goto('/?fault=initial-load');
	await expect(page.getByRole('status', { name: 'Loading timeline' })).toBeVisible();
	const composer = page.getByRole('textbox', { name: 'What would you like to share?' });
	await composer.fill('Published before the seed arrived');
	await composer.press('ControlOrMeta+Enter');
	const earlyPost = page.getByRole('article', { name: 'Post by Avery Stone' }).first();
	await expect(earlyPost).toContainText('Published before the seed arrived');
	await expect(earlyPost).toContainText('Sending…');
	const failure = page.getByRole('alert').filter({ hasText: 'We couldn’t load the timeline' });
	await expect(failure).toBeVisible();
	await expect(page).toHaveURL(/\?fault=initial-load$/);

	await failure.getByRole('button', { name: 'Try again' }).click();
	await expect(earlyPost).toContainText('Published before the seed arrived');
	await expect(earlyPost).toContainText('Published');
	await expect(page.getByRole('article', { name: 'Post by Maya Chen' }).first()).toBeVisible();
	await expect(earlyPost).toContainText('Published before the seed arrived');
	await expect(page).toHaveURL(/\?fault=initial-load$/);
});
