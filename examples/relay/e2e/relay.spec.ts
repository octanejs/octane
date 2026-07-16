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

async function consumeExpectedNotFoundDiagnostic(page: Page): Promise<void> {
	const diagnostics = runtimeDiagnostics.get(page);
	if (diagnostics === undefined) throw new Error('expected browser diagnostics for Relay journey');
	await expect.poll(() => diagnostics.records.length).toBe(1);
	expect(diagnostics.records).toEqual([
		expect.objectContaining({
			kind: 'console',
			level: 'error',
			message: 'Failed to load resource: the server responded with a status of 404 (Not Found)',
		}),
	]);
	diagnostics.clear();
}

test('deep links across responsive channels, isolates thread drafts, and preserves a reply across reopen', async ({
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

	let releaseInvalidThread: (() => void) | undefined;
	const invalidThreadGate = new Promise<void>((resolve) => {
		releaseInvalidThread = resolve;
	});
	let markInvalidThreadHeld: (() => void) | undefined;
	const invalidThreadHeld = new Promise<void>((resolve) => {
		markInvalidThreadHeld = resolve;
	});
	await page.route('**/api/thread**', async (route) => {
		const requestURL = new URL(route.request().url());
		if (
			requestURL.searchParams.get('channel') !== 'design' ||
			requestURL.searchParams.get('message') !== 'g-014'
		) {
			await route.continue();
			return;
		}
		const response = await route.fetch();
		markInvalidThreadHeld?.();
		await invalidThreadGate;
		await route.fulfill({ response });
	});
	const invalidThreadResponse = page.waitForResponse((candidate) => {
		const requestURL = new URL(candidate.url());
		return (
			requestURL.pathname === '/api/thread' && requestURL.searchParams.get('message') === 'g-014'
		);
	});
	const designHeading = page.getByRole('heading', { name: '# design' });
	try {
		await page.evaluate(() => {
			interface ThreadTransitionObservation {
				leakedRowanReply: boolean;
				leakedReplyTextbox: boolean;
				observer: MutationObserver;
			}
			const scope = window as Window & {
				relayThreadTransition?: ThreadTransitionObservation;
			};
			const observation = {
				leakedRowanReply: false,
				leakedReplyTextbox: false,
				observer: null as unknown as MutationObserver,
			};
			const inspect = (element: Element) => {
				if (
					element.matches('[aria-label="Reply from Rowan Ellis"]') ||
					element.querySelector('[aria-label="Reply from Rowan Ellis"]') !== null
				)
					observation.leakedRowanReply = true;
				if (element.matches('#thread-reply') || element.querySelector('#thread-reply') !== null) {
					observation.leakedReplyTextbox = true;
				}
			};
			observation.observer = new MutationObserver((records) => {
				if (window.location.pathname !== '/channels/design/thread/g-014') return;
				const dialog = document.querySelector('[role="dialog"]');
				if (dialog !== null) inspect(dialog);
				for (const record of records) {
					for (const node of record.addedNodes) {
						if (node instanceof Element) inspect(node);
					}
				}
			});
			observation.observer.observe(document.getElementById('panel-root') ?? document.body, {
				childList: true,
				subtree: true,
				attributes: true,
			});
			scope.relayThreadTransition = observation;
		});
		await page.evaluate(() => {
			history.pushState(null, '', '/channels/design/thread/g-014');
			window.dispatchEvent(new PopStateEvent('popstate'));
		});
		await expect(page).toHaveURL(/\/channels\/design\/thread\/g-014$/);
		await invalidThreadHeld;
		await expect(threadDialog.getByText('Loading replies…')).toBeVisible();
		await expect(page.getByRole('article', { name: 'Reply from Rowan Ellis' })).toHaveCount(0);
		await expect(threadDialog.getByRole('textbox', { name: 'Reply to thread' })).toHaveCount(0);
		expect(
			await page.evaluate(() => {
				const observation = (
					window as Window & {
						relayThreadTransition?: {
							leakedRowanReply: boolean;
							leakedReplyTextbox: boolean;
						};
					}
				).relayThreadTransition;
				return {
					leakedRowanReply: observation?.leakedRowanReply ?? false,
					leakedReplyTextbox: observation?.leakedReplyTextbox ?? false,
				};
			}),
		).toEqual({ leakedRowanReply: false, leakedReplyTextbox: false });
		releaseInvalidThread?.();
		const invalidResponse = await invalidThreadResponse;
		const invalidRequestURL = new URL(invalidResponse.url());
		expect(invalidRequestURL.searchParams.get('channel')).toBe('design');
		expect(invalidResponse.status()).toBe(404);
		await consumeExpectedNotFoundDiagnostic(page);
		await expect(designHeading).toBeVisible();
		await expect(threadDialog.getByRole('alert')).toContainText('Thread unavailable');
		await expect(threadHeading).toBeFocused();
		await expect(threadDialog.getByRole('article')).toHaveCount(0);
		await expect(page.getByRole('article', { name: 'Reply from Rowan Ellis' })).toHaveCount(0);
		await expect(threadDialog.getByRole('textbox', { name: 'Reply to thread' })).toHaveCount(0);
	} finally {
		await page.evaluate(() => {
			const scope = window as Window & {
				relayThreadTransition?: { observer: MutationObserver };
			};
			scope.relayThreadTransition?.observer.disconnect();
			delete scope.relayThreadTransition;
		});
		releaseInvalidThread?.();
		await page.unroute('**/api/thread**');
	}
	await page.keyboard.press('Escape');
	await expect(page).toHaveURL(/\/channels\/design$/);
	await expect(designHeading).toBeFocused();
	await page.evaluate(() => {
		history.pushState(null, '', '/channels/general/thread/g-014');
		window.dispatchEvent(new PopStateEvent('popstate'));
	});
	await expect(page).toHaveURL(/\/channels\/general\/thread\/g-014$/);
	await expect(page.getByRole('article', { name: 'Reply from Rowan Ellis' })).toBeVisible();
	await expect(threadHeading).toBeFocused();

	const reply = page.getByRole('textbox', { name: 'Reply to thread' });
	await reply.fill('This draft belongs to the handoff checklist.');
	await page.evaluate(() => {
		history.pushState(null, '', '/channels/general/thread/g-013');
		window.dispatchEvent(new PopStateEvent('popstate'));
	});
	await expect(page).toHaveURL(/\/channels\/general\/thread\/g-013$/);
	await expect(
		threadDialog.getByText('Two customers volunteered for the workflow follow-up next week.'),
	).toBeVisible();
	await expect(threadDialog.getByRole('article', { name: 'Reply from Maya Chen' })).toBeVisible();
	await expect(reply).toHaveValue('');
	await expect(threadDialog.getByRole('button', { name: 'Reply' })).toBeDisabled();
	await page.goBack();
	await expect(page).toHaveURL(/\/channels\/general\/thread\/g-014$/);
	await expect(page.getByRole('article', { name: 'Reply from Rowan Ellis' })).toBeVisible();
	await expect(threadHeading).toBeFocused();

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

	let releaseStaleThread: (() => void) | undefined;
	const staleThreadGate = new Promise<void>((resolve) => {
		releaseStaleThread = resolve;
	});
	let markStaleThreadHeld: (() => void) | undefined;
	const staleThreadHeld = new Promise<void>((resolve) => {
		markStaleThreadHeld = resolve;
	});
	let markStaleThreadReleased: (() => void) | undefined;
	const staleThreadReleased = new Promise<void>((resolve) => {
		markStaleThreadReleased = resolve;
	});
	let matchingThreadRequests = 0;
	await page.route('**/api/thread**', async (route) => {
		const requestURL = new URL(route.request().url());
		if (
			requestURL.searchParams.get('channel') !== 'general' ||
			requestURL.searchParams.get('message') !== 'g-014' ||
			++matchingThreadRequests !== 1
		) {
			await route.continue();
			return;
		}
		const response = await route.fetch();
		markStaleThreadHeld?.();
		await staleThreadGate;
		await route.fulfill({ response });
		markStaleThreadReleased?.();
	});

	await threadLink.click();
	await staleThreadHeld;
	try {
		await expect(page).toHaveURL(/\/channels\/general\/thread\/g-014$/);
		await expect(threadDialog.getByText('Loading replies…')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page).toHaveURL(/\/channels\/general$/);
		await expect(threadLink).toBeFocused();

		await threadLink.click();
		await expect(page).toHaveURL(/\/channels\/general\/thread\/g-014$/);
		await expect(threadHeading).toBeFocused();
		await expect(authoredReply).toBeVisible();
		await expect(threadDialog.getByRole('article')).toHaveCount(4);
		await reply.focus();
		releaseStaleThread?.();
		await staleThreadReleased;
		await settleBrowserFrames(page);
		await expect(reply).toBeFocused();
	} finally {
		releaseStaleThread?.();
		await page.unroute('**/api/thread**');
	}

	await page.keyboard.press('Escape');
	await expect(page).toHaveURL(/\/channels\/general$/);
	await expect(threadLink).toBeFocused();
	await threadLink.click();
	await expect(page).toHaveURL(/\/channels\/general\/thread\/g-014$/);
	await expect(threadHeading).toBeFocused();
	const detachedThreadResponse = page.waitForResponse((candidate) => {
		const requestURL = new URL(candidate.url());
		return (
			requestURL.pathname === '/api/thread' &&
			requestURL.searchParams.get('channel') === 'design' &&
			requestURL.searchParams.get('message') === 'g-014'
		);
	});
	await page.evaluate(() => {
		history.pushState(null, '', '/channels/design/thread/g-014');
		window.dispatchEvent(new PopStateEvent('popstate'));
	});
	await expect(page).toHaveURL(/\/channels\/design\/thread\/g-014$/);
	expect((await detachedThreadResponse).status()).toBe(404);
	await consumeExpectedNotFoundDiagnostic(page);
	await expect(designHeading).toBeVisible();
	await expect(threadLink).toHaveCount(0);
	await expect(threadDialog.getByRole('alert')).toContainText('Thread unavailable');
	await expect(threadDialog.getByRole('textbox', { name: 'Reply to thread' })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(page).toHaveURL(/\/channels\/design$/);
	await expect(designHeading).toBeFocused();

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

		const demoResponse = page.waitForResponse(
			(response) => new URL(response.url()).pathname === '/api/demo',
		);
		await page.getByRole('button', { name: 'Bring in a teammate update' }).evaluate((element) => {
			(element as HTMLButtonElement).click();
		});
		expect((await demoResponse).status()).toBe(202);
		await expect(
			page.getByText('Live update: the launch checklist review starts in ten minutes.'),
		).toBeVisible();
		await expect(page.locator('.activity-announcer')).toHaveText('Maya Chen posted in #general');
		await expect(loadEarlier).toHaveText('Loading earlier messages…');
		await expect(loadEarlier).toBeFocused();
	} finally {
		releaseInitialHistory?.();
	}
	await expect(page.locator('[data-message-id="g-005"]')).toBeAttached();
	await expect(page.locator('.activity-announcer')).toHaveText(
		'Earlier messages loaded without moving your place',
	);
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
	await composer.fill('General-only handoff draft');
	await channels.getByRole('link', { name: 'design', exact: true }).click();
	await expect(page.getByRole('heading', { name: '# design' })).toBeFocused();
	const designComposer = page.getByRole('textbox', { name: 'Message #design' });
	await expect(designComposer).toHaveValue('');
	await designComposer.fill('Design-only critique draft');
	await channels.getByRole('link', { name: 'general' }).click();
	await expect(page.getByRole('heading', { name: '# general' })).toBeFocused();
	await expect(composer).toHaveValue('General-only handoff draft');
	await channels.getByRole('link', { name: 'design', exact: true }).click();
	await expect(designComposer).toHaveValue('Design-only critique draft');
	await channels.getByRole('link', { name: 'general' }).click();
	await expect(composer).toHaveValue('General-only handoff draft');
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
