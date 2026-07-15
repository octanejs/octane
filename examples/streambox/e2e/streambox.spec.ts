import type { Locator, Page } from '@playwright/test';
import { expect, test } from './test.ts';

async function openVideo(page: Page, path = '/watch/neon-tides') {
	await page.goto(path);
	await expect(page.getByLabel('Loading Streambox video')).toHaveAttribute('aria-busy', 'true');
	await expect(page.getByTestId('watch-ready')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Play video' })).toBeEnabled();
	await expect
		.poll(() =>
			page
				.getByTestId('streambox-video')
				.evaluate((element) => (element as HTMLVideoElement).readyState),
		)
		.toBeGreaterThanOrEqual(1);
}

async function focusByTab(page: Page, target: Locator, maximumTabs = 30) {
	for (let attempt = 0; attempt < maximumTabs; attempt++) {
		await page.keyboard.press('Tab');
		if (await target.evaluate((element) => element === document.activeElement)) return;
	}
	throw new Error(`Could not reach ${await target.getAttribute('aria-label')} by keyboard`);
}

test('plays, seeks, changes volume, and ends through native media events', async ({ page }) => {
	await openVideo(page);
	const player = page.getByTestId('streambox-video');
	await expect(
		page.getByRole('heading', { name: 'Neon tides: a night swim in the city' }),
	).toBeVisible();
	await expect(page.getByTestId('media-event')).toHaveText('Native event · metadata loaded');

	await page.getByRole('button', { name: 'Play video' }).click();
	await expect(page.getByRole('button', { name: 'Pause video' })).toBeVisible();
	await expect(page.getByTestId('media-event')).toHaveText('Native event · play');
	await expect
		.poll(() => player.evaluate((video) => (video as HTMLVideoElement).currentTime))
		.toBeGreaterThan(0.2);
	await expect
		.poll(() => player.evaluate((video) => (video as HTMLVideoElement).paused))
		.toBe(false);

	await page.getByRole('button', { name: 'Pause video' }).click();
	await expect(page.getByTestId('media-event')).toHaveText('Native event · pause');
	await expect
		.poll(() => player.evaluate((video) => (video as HTMLVideoElement).paused))
		.toBe(true);

	await page.getByRole('button', { name: 'Unmute video' }).click();
	await expect(page.getByRole('button', { name: 'Mute video' })).toBeVisible();
	await expect(page.getByTestId('media-event')).toHaveText('Native event · volume changed');
	await expect
		.poll(() => player.evaluate((video) => (video as HTMLVideoElement).muted))
		.toBe(false);

	const duration = await player.evaluate((video) => (video as HTMLVideoElement).duration);
	await page.getByRole('slider', { name: 'Seek video' }).fill(String(Math.max(0, duration - 0.3)));
	await expect(page.getByTestId('media-event')).toHaveText('Native event · seeked');
	await page.getByRole('button', { name: 'Play video' }).click();
	await expect(page.getByTestId('activity-status')).toContainText('Playback complete', {
		timeout: 5_000,
	});
	await expect(page.getByTestId('media-event')).toHaveText('Native event · ended');
	await expect.poll(() => player.evaluate((video) => (video as HTMLVideoElement).ended)).toBe(true);
});

test('preserves the live player while theater mode and deep-linked panels update around it', async ({
	page,
}) => {
	await openVideo(page);
	const player = page.getByTestId('streambox-video');
	await page.getByRole('button', { name: 'Play video' }).click();
	await expect
		.poll(() => player.evaluate((video) => (video as HTMLVideoElement).currentTime))
		.toBeGreaterThan(0.25);
	await page.getByRole('button', { name: 'Pause video' }).click();
	const heldTime = await player.evaluate((video) => (video as HTMLVideoElement).currentTime);
	await player.evaluate((element) => {
		(window as Window & { streamboxPlayer?: Element }).streamboxPlayer = element;
	});

	await page.getByRole('button', { name: 'Enter theater mode' }).click();
	await expect(page.getByRole('button', { name: 'Exit theater mode' })).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	await expect(page.getByRole('complementary', { name: 'Up next' })).toBeHidden();

	await page.getByRole('link', { name: /Comments/ }).click();
	await expect(page).toHaveURL(/\/watch\/neon-tides\/comments$/);
	await expect(page.getByRole('heading', { name: '180 comments' })).toBeVisible();
	await page.getByRole('searchbox', { name: 'Search videos' }).fill('quiet current');
	await expect(page.getByLabel('Video search results')).toContainText(
		'The quiet current beneath the pines',
	);

	expect(
		await player.evaluate(
			(element) => (window as Window & { streamboxPlayer?: Element }).streamboxPlayer === element,
		),
	).toBe(true);
	await expect
		.poll(() => player.evaluate((video) => (video as HTMLVideoElement).currentTime))
		.toBeGreaterThanOrEqual(heldTime - 0.05);

	await page.getByRole('link', { name: 'Transcript' }).click();
	await expect(page).toHaveURL(/\/watch\/neon-tides\/transcript$/);
	await expect(page.getByRole('heading', { name: 'Interactive transcript' })).toBeVisible();
	expect(
		await player.evaluate(
			(element) => (window as Window & { streamboxPlayer?: Element }).streamboxPlayer === element,
		),
	).toBe(true);

	await page.getByRole('button', { name: 'Like', exact: true }).click();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await page.getByRole('button', { name: 'Follow', exact: true }).click();
	await page
		.getByLabel('Video search results')
		.getByRole('link', { name: /The quiet current beneath the pines/ })
		.click();
	await expect(page).toHaveURL(/\/watch\/quiet-current$/);
	await expect(
		page.getByRole('heading', { name: 'The quiet current beneath the pines' }),
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Like', exact: true })).toHaveAttribute(
		'aria-pressed',
		'false',
	);
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveAttribute(
		'aria-pressed',
		'false',
	);
	await expect(page.getByRole('button', { name: 'Follow', exact: true })).toHaveAttribute(
		'aria-pressed',
		'false',
	);

	await page.getByRole('searchbox', { name: 'Search videos' }).fill('neon tides');
	await page
		.getByLabel('Video search results')
		.getByRole('link', { name: /Neon tides: a night swim in the city/ })
		.click();
	await expect(page).toHaveURL(/\/watch\/neon-tides$/);
	await expect(page.getByRole('button', { name: 'Liked', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	await expect(page.getByRole('button', { name: 'Saved', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	await expect(page.getByRole('button', { name: 'Following', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true',
	);
});

test('windows a long comment conversation and recovers from an empty search', async ({ page }) => {
	await openVideo(page, '/watch/neon-tides/comments');
	const window = page.getByTestId('comments-window');
	await expect(page.getByRole('heading', { name: '180 comments' })).toBeVisible();
	await expect(page.locator('[data-comment-id="neon-tides-comment-1"]')).toBeVisible();

	await window.evaluate((element) => {
		element.scrollTop = element.scrollHeight;
		element.dispatchEvent(new Event('scroll'));
	});
	await expect(page.locator('[data-comment-id="neon-tides-comment-180"]')).toBeVisible();
	await expect(page.locator('[data-comment-id="neon-tides-comment-1"]')).toHaveCount(0);

	await window.evaluate((element) => {
		element.scrollTop = 0;
		element.dispatchEvent(new Event('scroll'));
	});
	await page.getByRole('combobox', { name: 'Sort comments' }).selectOption('latest');
	await expect(page.locator('[data-comment-id="neon-tides-comment-180"]')).toBeVisible();

	await page.getByRole('searchbox', { name: 'Search comments' }).fill('phrase-not-in-fixture');
	await expect(page.getByRole('status').filter({ hasText: 'No comments found' })).toBeVisible();
	await expect(page.locator('[data-comment-id]')).toHaveCount(0);
	await page.getByRole('button', { name: 'Clear comment search' }).click();
	await expect(page.getByTestId('comments-window')).toBeVisible();
	await expect(page.locator('[data-comment-id="neon-tides-comment-180"]')).toBeVisible();
});

test('supports a responsive deep link and completes the player path by keyboard', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openVideo(page, '/watch/quiet-current/transcript');
	await expect(
		page.getByRole('heading', { name: 'The quiet current beneath the pines' }),
	).toBeVisible();
	await expect(page.getByLabel('Streambox navigation')).toBeHidden();

	await page.keyboard.press('Tab');
	await expect(page.getByRole('link', { name: 'Skip to video' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('main')).toBeFocused();

	const playButton = page.getByRole('button', { name: 'Play video' });
	await focusByTab(page, playButton);
	await expect(playButton).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('button', { name: 'Pause video' })).toBeVisible();
	await expect
		.poll(() =>
			page
				.getByTestId('streambox-video')
				.evaluate((video) => (video as HTMLVideoElement).currentTime),
		)
		.toBeGreaterThan(0.15);
	await page.keyboard.press('Enter');
	await expect(page.getByRole('button', { name: 'Play video' })).toBeVisible();

	const overviewLink = page.getByRole('link', { name: 'Overview' });
	await focusByTab(page, overviewLink);
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/watch\/quiet-current$/);
	await page.keyboard.press('Tab');
	await expect(page.getByRole('link', { name: /Comments/ })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('link', { name: 'Transcript' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/watch\/quiet-current\/transcript$/);

	const transcriptCue = page.getByRole('button', { name: /Below the pines/ });
	await focusByTab(page, transcriptCue);
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('media-event')).toHaveText('Native event · seeked');
	await expect
		.poll(() =>
			page
				.getByTestId('streambox-video')
				.evaluate((video) => (video as HTMLVideoElement).currentTime),
		)
		.toBeGreaterThanOrEqual(1.9);
});

test('retries a failed catalog and queues rapid actions while local playback stays offline', async ({
	page,
	context,
}) => {
	await page.goto('/watch/neon-tides?scenario=failure');
	await expect(page.getByRole('alert')).toContainText('We couldn’t load this video');
	await page.getByRole('button', { name: 'Retry loading video' }).click();
	await expect(page.getByTestId('watch-ready')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Play video' })).toBeEnabled();

	await page.getByRole('button', { name: 'Play video' }).click();
	await expect
		.poll(() =>
			page
				.getByTestId('streambox-video')
				.evaluate((video) => (video as HTMLVideoElement).currentTime),
		)
		.toBeGreaterThan(0.15);
	await page.getByRole('button', { name: 'Pause video' }).click();

	await context.setOffline(true);
	await expect(page.getByText('Offline', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Like', exact: true }).click();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await page.getByRole('button', { name: 'Follow', exact: true }).click();
	await expect(page.getByTestId('queued-actions')).toHaveText('3 queued actions');
	await expect(page.getByRole('button', { name: 'Liked', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	await expect(page.getByRole('button', { name: 'Saved', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	await expect(page.getByRole('button', { name: 'Following', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true',
	);

	const beforeOfflinePlayback = await page
		.getByTestId('streambox-video')
		.evaluate((video) => (video as HTMLVideoElement).currentTime);
	await page.getByRole('button', { name: 'Play video' }).click();
	await expect
		.poll(() =>
			page
				.getByTestId('streambox-video')
				.evaluate((video) => (video as HTMLVideoElement).currentTime),
		)
		.toBeGreaterThan(beforeOfflinePlayback + 0.1);
	await page.getByRole('button', { name: 'Pause video' }).click();

	await context.setOffline(false);
	await expect(page.getByTestId('activity-status')).toContainText('3 offline actions synced');
});
