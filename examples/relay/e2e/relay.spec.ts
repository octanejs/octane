import { expect, test, type Page } from '@playwright/test';
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

async function openGeneral(page: Page): Promise<void> {
	await page.goto('/channels/general');
	await expect(page.getByRole('heading', { name: '# general' })).toBeVisible();
	await expect(page.getByRole('article', { name: 'Message from Maya Chen' }).first()).toBeVisible();
	await expect(page.getByRole('status', { name: 'Realtime connection: live' })).toBeVisible();
}

test('deep links across responsive channels and preserves a thread reply across reopen', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/channels/general/thread/g-014');
	await expect(page).toHaveURL(/\/channels\/general\/thread\/g-014$/);
	await expect(page.getByRole('heading', { name: '# general' })).toBeVisible();
	const threadHeading = page.getByRole('heading', { name: 'Thread' });
	await expect(threadHeading).toBeVisible();
	await expect(threadHeading).toBeFocused();
	const threadDialog = page.getByRole('dialog', { name: 'Thread' });
	await expect(threadDialog).toBeVisible();
	await expect(page.getByRole('article', { name: 'Reply from Rowan Ellis' })).toBeVisible();

	const reply = page.getByRole('textbox', { name: 'Reply to thread' });
	await page.keyboard.press('Shift+Tab');
	await expect(reply).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('button', { name: 'Close thread' })).toBeFocused();
	const replyBody = 'I’ll add the release owner before handoff.';
	await reply.fill(replyBody);
	await reply.press('ControlOrMeta+Enter');
	const authoredReply = threadDialog
		.getByRole('article', { name: 'Reply from Avery Stone' })
		.filter({ hasText: replyBody });
	await expect(authoredReply).toBeVisible();
	await expect(threadDialog.getByText('4 replies', { exact: true })).toBeVisible();
	await reply.press('Escape');
	await expect(page).toHaveURL(/\/channels\/general$/);
	await expect(page.getByRole('heading', { name: '# general' })).toBeFocused();

	const threadLink = page
		.locator('[data-message-id="g-014"]')
		.getByRole('link', { name: '4 replies', exact: true });
	await expect(threadLink).toBeVisible();
	await threadLink.click();
	await expect(page).toHaveURL(/\/channels\/general\/thread\/g-014$/);
	await expect(threadHeading).toBeFocused();
	await expect(authoredReply).toBeVisible();
	await expect(threadDialog.getByRole('article')).toHaveCount(4);
	await page.keyboard.press('Escape');
	await expect(page).toHaveURL(/\/channels\/general$/);
	await expect(threadLink).toBeFocused();

	const mobileChannels = page.getByRole('navigation', { name: 'Mobile channels' });
	await mobileChannels.getByRole('link', { name: 'design' }).click();
	await expect(page).toHaveURL(/\/channels\/design$/);
	await expect(page.getByRole('heading', { name: '# design' })).toBeVisible();
	await expect(page.getByText('The prototype is ready for the 2pm critique.')).toBeVisible();
	await mobileChannels.getByRole('link', { name: 'random' }).click();
	await expect(page).toHaveURL(/\/channels\/random$/);
	await expect(page.getByRole('heading', { name: 'Start #random' })).toBeVisible();
});

test('receives and reconciles messages through the production SSE boundary', async ({ page }) => {
	const streamResponse = page.waitForResponse(
		(response) => new URL(response.url()).pathname === '/api/stream',
	);
	await openGeneral(page);
	const response = await streamResponse;
	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toContain('text/event-stream');

	const demoResponse = page.waitForResponse(
		(candidate) => new URL(candidate.url()).pathname === '/api/demo',
	);
	await page.getByRole('button', { name: 'Bring in a teammate update' }).click();
	expect((await demoResponse).status()).toBe(202);
	const incoming = page.getByText(
		'Live update: the launch checklist review starts in ten minutes.',
	);
	await expect(incoming).toBeVisible();
	await expect(incoming).toHaveCount(1);

	const composer = page.getByRole('textbox', { name: 'Message #general' });
	await composer.fill('Customer follow-up is scheduled for Thursday.');
	await composer.press('ControlOrMeta+Enter');
	const outgoing = page
		.getByRole('article', { name: 'Message from Avery Stone' })
		.filter({ hasText: 'Customer follow-up is scheduled for Thursday.' });
	await expect(outgoing).toContainText('Sending…');
	await expect(composer).toHaveValue('');
	await expect(composer).toBeFocused();
	await expect(outgoing).not.toContainText('Sending…');
	await expect(outgoing).toHaveCount(1);
});

test('prepends earlier history without moving or replacing the visible survivor', async ({
	page,
}) => {
	await openGeneral(page);
	const conversation = page.locator('#conversation');
	await conversation.evaluate((element) => {
		element.scrollTop = 0;
	});
	const survivor = page.locator('[data-message-id="g-011"]');
	await expect(survivor).toBeVisible();
	const survivorBefore = await survivor.elementHandle();
	if (survivorBefore === null) throw new Error('expected the first recent message');
	const before = await survivor.evaluate((element) => ({
		top: element.getBoundingClientRect().top,
		scrollTop: element.closest('#conversation')?.scrollTop ?? 0,
	}));

	let earlierRequestCount = 0;
	let releaseInitialHistory: (() => void) | undefined;
	const initialHistoryGate = new Promise<void>((resolve) => {
		releaseInitialHistory = resolve;
	});
	let markInitialHistoryHeld: (() => void) | undefined;
	const initialHistoryHeld = new Promise<void>((resolve) => {
		markInitialHistoryHeld = resolve;
	});
	await page.route('**/api/history**', async (route) => {
		const requestURL = new URL(route.request().url());
		if (
			requestURL.searchParams.get('channel') !== 'general' ||
			requestURL.searchParams.get('before') !== 'g-011'
		) {
			await route.continue();
			return;
		}
		earlierRequestCount++;
		const response = await route.fetch();
		markInitialHistoryHeld?.();
		await initialHistoryGate;
		await route.fulfill({ response });
	});
	const loadEarlier = page.getByRole('button', { name: /earlier messages/i });
	await loadEarlier.focus();
	await loadEarlier.evaluate((element) => {
		const button = element as HTMLButtonElement;
		button.click();
		button.click();
	});
	await initialHistoryHeld;
	try {
		await expect(loadEarlier).toHaveText('Loading earlier messages…');
		await expect(loadEarlier).toHaveAttribute('aria-busy', 'true');
		await expect(loadEarlier).toHaveAttribute('aria-disabled', 'true');
		await expect(loadEarlier).toBeFocused();
		await loadEarlier.press('Enter');
		await settleBrowserFrames(page);
		expect(earlierRequestCount).toBe(1);
	} finally {
		releaseInitialHistory?.();
	}
	await expect(page.locator('[data-message-id="g-005"]')).toBeAttached();
	await page.unroute('**/api/history**');
	await expect(loadEarlier).toBeEnabled();
	await expect(loadEarlier).toBeFocused();
	const survivorAfter = await survivor.elementHandle();
	if (survivorAfter === null) throw new Error('expected the recent message after history prepend');
	expect(
		await page.evaluate(([left, right]) => left === right, [survivorBefore, survivorAfter]),
	).toBe(true);
	const after = await survivor.evaluate((element) => ({
		top: element.getBoundingClientRect().top,
		scrollTop: element.closest('#conversation')?.scrollTop ?? 0,
	}));
	expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(1);
	expect(after.scrollTop).toBeGreaterThan(before.scrollTop);

	// Hold a completed pagination response across a channel navigation. The late
	// #general page must not contaminate the active #design conversation.
	let releaseHistory: (() => void) | undefined;
	const historyGate = new Promise<void>((resolve) => {
		releaseHistory = resolve;
	});
	let markHistoryHeld: (() => void) | undefined;
	const historyHeld = new Promise<void>((resolve) => {
		markHistoryHeld = resolve;
	});
	let markHistoryReleased: (() => void) | undefined;
	const historyReleased = new Promise<void>((resolve) => {
		markHistoryReleased = resolve;
	});
	await page.route('**/api/history**', async (route) => {
		const requestURL = new URL(route.request().url());
		if (
			requestURL.searchParams.get('channel') !== 'general' ||
			!requestURL.searchParams.has('before')
		) {
			await route.continue();
			return;
		}
		const response = await route.fetch();
		markHistoryHeld?.();
		await historyGate;
		await route.fulfill({ response });
		markHistoryReleased?.();
	});

	await loadEarlier.click();
	await historyHeld;
	const channels = page.getByRole('navigation', { name: 'Workspace channels' });
	await channels.getByRole('link', { name: 'design', exact: true }).click();
	await expect(page).toHaveURL(/\/channels\/design$/);
	const designHeading = page.getByRole('heading', { name: '# design' });
	await expect(designHeading).toBeFocused();
	await expect(page.getByText('The prototype is ready for the 2pm critique.')).toBeVisible();
	releaseHistory?.();
	await historyReleased;
	await settleBrowserFrames(page);
	await expect(page.locator('[data-message-id="g-001"]')).toHaveCount(0);
	await expect(
		page.getByText('Morning! The customer notes from Berlin are in the research folder.'),
	).toHaveCount(0);
	await expect(page.locator('article.message')).toHaveCount(8);
	await expect(designHeading).toBeFocused();
});

test('replays missed updates once and converges retried and out-of-order sends', async ({
	page,
}) => {
	await openGeneral(page);
	const composer = page.getByRole('textbox', { name: 'Message #general' });
	await composer.fill('A draft that must survive reconnect');
	await page.getByRole('button', { name: 'Pause live updates' }).click();
	await expect(page.getByRole('status', { name: 'Realtime connection: paused' })).toBeVisible();
	await expect(composer).toHaveValue('A draft that must survive reconnect');
	await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();

	const queue = page.getByRole('button', { name: 'Queue teammate update' });
	await queue.click();
	await queue.click();
	await page.getByRole('button', { name: 'Reconnect' }).click();
	await expect(page.getByRole('status', { name: 'Realtime connection: live' })).toBeVisible();
	const firstReplay = page.getByText(
		'Live update: the launch checklist review starts in ten minutes.',
	);
	const secondReplay = page.getByText(
		'The customer debrief is posted — the shorter setup tested best.',
	);
	await expect(firstReplay).toHaveCount(1);
	await expect(secondReplay).toHaveCount(1);
	await expect(composer).toHaveValue('A draft that must survive reconnect');

	let markRepeatedPublish: (() => void) | undefined;
	const repeatedPublish = new Promise<void>((resolve) => {
		markRepeatedPublish = resolve;
	});
	await page.route('**/api/messages', async (route) => {
		const payload = route.request().postDataJSON() as { body?: unknown };
		if (payload.body !== 'Second fast acknowledgement') {
			await route.continue();
			return;
		}
		const firstResponse = await route.fetch();
		await route.fetch();
		await route.fulfill({ response: firstResponse });
		markRepeatedPublish?.();
	});

	await composer.fill('First slow acknowledgement');
	await composer.press('ControlOrMeta+Enter');
	await composer.fill('Second fast acknowledgement');
	await composer.press('ControlOrMeta+Enter');
	await repeatedPublish;
	const first = page
		.getByRole('article', { name: 'Message from Avery Stone' })
		.filter({ hasText: 'First slow acknowledgement' });
	const second = page
		.getByRole('article', { name: 'Message from Avery Stone' })
		.filter({ hasText: 'Second fast acknowledgement' });
	await expect(second).not.toContainText('Sending…');
	await expect(first).toContainText('Sending…');
	await expect(first).not.toContainText('Sending…');
	await expect(first).toHaveCount(1);
	await expect(second).toHaveCount(1);
	expect(
		await page
			.locator('article.message')
			.evaluateAll((articles) =>
				articles
					.filter((article) => /acknowledgement/.test(article.textContent ?? ''))
					.map((article) => article.textContent),
			),
	).toEqual([
		expect.stringContaining('First slow acknowledgement'),
		expect.stringContaining('Second fast acknowledgement'),
	]);

	await page.getByRole('button', { name: 'Pause live updates' }).click();
	await page.getByRole('button', { name: 'Reconnect' }).click();
	await expect(page.getByRole('status', { name: 'Realtime connection: live' })).toBeVisible();
	await expect(first).toHaveCount(1);
	await expect(second).toHaveCount(1);

	const channels = page.getByRole('navigation', { name: 'Workspace channels' });
	await channels.getByRole('link', { name: 'design', exact: true }).click();
	await expect(page.getByRole('heading', { name: '# design' })).toBeFocused();
	await channels.getByRole('link', { name: 'general' }).click();
	await expect(page.getByRole('heading', { name: '# general' })).toBeFocused();
	await expect(first).toHaveCount(1);
	await expect(second).toHaveCount(1);
});

test('recovers initial history failure while preserving a draft and exposes an empty channel', async ({
	page,
}) => {
	await page.goto('/?fault=history');
	await expect(page.getByRole('status', { name: 'Loading conversation' })).toBeVisible();
	const failure = page.getByRole('alert').filter({ hasText: 'Conversation out of reach' });
	await expect(failure).toBeVisible();
	await expect(page).toHaveURL(/\/channels\/general\?fault=history$/);
	const composer = page.getByRole('textbox', { name: 'Message #general' });
	await composer.fill('Keep this draft through the retry');
	await failure.getByRole('button', { name: 'Try again' }).click();
	await expect(page.getByRole('article', { name: 'Message from Maya Chen' }).first()).toBeVisible();
	await expect(composer).toHaveValue('Keep this draft through the retry');

	const channels = page.getByRole('navigation', { name: 'Workspace channels' });
	await channels.getByRole('link', { name: 'random', exact: true }).click();
	await expect(page).toHaveURL(/\/channels\/random\?fault=history$/);
	await expect(page.getByRole('heading', { name: 'Start #random' })).toBeVisible();
	await expect(page.getByText('This channel is wonderfully quiet.')).toBeVisible();
});
