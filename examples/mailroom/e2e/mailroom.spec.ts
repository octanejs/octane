import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
	collectBrowserDiagnostics,
	settleBrowserFrames,
	type BrowserDiagnostics,
} from '../../_shared/e2e/browser.ts';

const runtimeDiagnostics = new WeakMap<Page, BrowserDiagnostics>();

function sessionForAttempt(label: string, testInfo: TestInfo): string {
	return `${label}-repeat${testInfo.repeatEachIndex}-retry${testInfo.retry}-worker${testInfo.workerIndex}`;
}

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

test('opens a deep-linked message, navigates by keyboard, and persists a fetcher star without leaving', async ({
	page,
}, testInfo) => {
	const session = sessionForAttempt('mailroom-deep-link', testInfo);
	await page.setViewportSize({ width: 1080, height: 760 });
	await page.goto(`/mail/inbox/launch-window?session=${session}`);

	await expect(
		page.getByRole('heading', { level: 2, name: 'The launch window is ours' }),
	).toBeVisible();
	await expect(page.getByRole('link', { name: /The launch window is ours/ })).toHaveAttribute(
		'aria-current',
		'page',
	);

	const fieldNotes = page.getByRole('link', { name: /Field notes from the pilot/ });
	await fieldNotes.focus();
	await fieldNotes.press('Enter');
	await expect(page.getByText('Opening mailbox…')).toBeVisible();
	await expect(page).toHaveURL(new RegExp(`/mail/inbox/field-notes[?]session=${session}$`));
	await expect(
		page.getByRole('heading', { level: 2, name: 'Field notes from the pilot' }),
	).toBeVisible();
	await expect(fieldNotes).toBeFocused();

	const urlBeforeMutation = page.url();
	const star = page.getByRole('button', { name: 'Star message' });
	await star.click();
	await expect(page.getByText('Saving star…')).toBeVisible();
	await expect(page).toHaveURL(urlBeforeMutation);
	await expect(page.getByRole('button', { name: 'Remove star' })).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	await expect(page.getByText('Star saved')).toBeVisible();

	await page.reload();
	await expect(
		page.getByRole('heading', { level: 2, name: 'Field notes from the pilot' }),
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Remove star' })).toHaveAttribute(
		'aria-pressed',
		'true',
	);
});

test('keeps every compact mailbox link named and keyboard operable', async ({ page }, testInfo) => {
	const session = sessionForAttempt('mailroom-compact-navigation', testInfo);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(`/mail/inbox?session=${session}`);

	const mailboxes = page.getByRole('navigation', { name: 'Mailboxes' });
	const mailboxJourneys = [
		{ folder: 'starred', name: 'Starred, 1 item', heading: 'Starred' },
		{ folder: 'sent', name: 'Sent, 1 item', heading: 'Sent' },
		{ folder: 'drafts', name: 'Drafts, 1 item', heading: 'Drafts' },
		{ folder: 'archive', name: 'Archive, 0 items', heading: 'Archive' },
		{ folder: 'outbox', name: 'Outbox, 0 items', heading: 'Outbox' },
		{ folder: 'inbox', name: 'Inbox, 4 items', heading: 'Inbox' },
	];

	await expect(
		mailboxes.getByRole('link', { name: 'Inbox, 4 items', exact: true }),
	).toHaveAttribute('aria-current', 'page');
	for (const mailbox of mailboxJourneys) {
		const link = mailboxes.getByRole('link', { name: mailbox.name, exact: true });
		await expect(link).toBeVisible();
		await link.focus();
		await expect(link).toBeFocused();
		await link.press('Enter');
		await expect(page).toHaveURL(new RegExp(`/mail/${mailbox.folder}[?]session=${session}$`));
		await expect(page.getByRole('heading', { name: mailbox.heading, level: 1 })).toBeVisible();
		await expect(link).toHaveAttribute('aria-current', 'page');
	}

	await mailboxes.getByRole('link', { name: 'Archive, 0 items', exact: true }).press('Enter');
	await expect(page.getByRole('heading', { name: 'No mail in archive', level: 2 })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true,
	);
});

test('blocks dirty draft navigation, restores editor focus, and saves through a fetcher before leaving', async ({
	page,
}, testInfo) => {
	const session = sessionForAttempt('mailroom-draft', testInfo);
	await page.goto(`/compose/partnership-note?session=${session}`);

	const body = page.getByRole('textbox', { name: 'Message' });
	await expect(body).toHaveValue(/generous workshop/);
	await body.fill('Thanks for the generous workshop. Let’s begin the shared pilot next Thursday.');
	await expect(page.getByRole('status').filter({ hasText: 'Unsaved changes' })).toBeVisible();

	await page.getByRole('link', { name: /Inbox/ }).click();
	await expect(page).toHaveURL(new RegExp(`/compose/partnership-note[?]session=${session}$`));
	const dialog = page.getByRole('dialog', { name: 'Leave this draft?' });
	await expect(dialog).toBeVisible();
	const keepWriting = dialog.getByRole('button', { name: 'Keep writing' });
	await expect(keepWriting).toBeFocused();
	await keepWriting.press('Enter');
	await expect(dialog).toBeHidden();
	await expect(body).toBeFocused();
	await expect(body).toHaveValue(/next Thursday/);

	await page.getByRole('button', { name: 'Save draft' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Draft saved' })).toBeVisible();
	await page.getByRole('link', { name: /Inbox/ }).click();
	await expect(page).toHaveURL(new RegExp(`/mail/inbox[?]session=${session}$`));
	await expect(dialog).toHaveCount(0);

	await page.getByRole('link', { name: /Drafts/ }).click();
	await page.getByRole('link', { name: /A thoughtful next step/ }).click();
	await expect(body).toHaveValue(/next Thursday/);
	await page.reload();
	await expect(body).toHaveValue(/next Thursday/);
});

test('resets the editor between draft routes and updates one draft across repeated saves', async ({
	page,
}, testInfo) => {
	const session = sessionForAttempt('mailroom-draft-identity', testInfo);
	await page.goto(`/compose/partnership-note?session=${session}`);
	const recipient = page.getByRole('textbox', { name: 'To' });
	const subject = page.getByRole('textbox', { name: 'Subject' });
	const body = page.getByRole('textbox', { name: 'Message' });
	const draftState = page.locator('.draft-state');

	await expect(subject).toHaveValue('A thoughtful next step');
	await page.getByRole('link', { name: 'Compose', exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/compose/new[?]session=${session}$`));
	await expect(recipient).toHaveValue('');
	await expect(subject).toHaveValue('');
	await expect(body).toHaveValue('');
	await expect(draftState).toHaveText('Not saved yet');

	await page.getByRole('button', { name: 'Save draft' }).click();
	await expect(page.getByRole('alert')).toContainText('Add a recipient, subject, and message');
	await page.goBack();
	await expect(page).toHaveURL(new RegExp(`/compose/partnership-note[?]session=${session}$`));
	await expect(subject).toHaveValue('A thoughtful next step');
	await expect(page.getByRole('alert')).toHaveCount(0);

	await subject.fill('Temporary unsaved subject');
	await expect(draftState).toHaveText('Unsaved changes');
	await page.getByRole('link', { name: 'Compose', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Leave this draft?' });
	await expect(dialog).toBeVisible();
	const keepWriting = dialog.getByRole('button', { name: 'Keep writing' });
	const discardChanges = dialog.getByRole('button', { name: 'Discard changes' });
	await expect(keepWriting).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(discardChanges).toBeFocused();
	await page.evaluate(() => window.dispatchEvent(new Event('offline')));
	await expect(page.getByRole('button', { name: 'Queue for later' })).toBeVisible();
	await expect(discardChanges).toBeFocused();
	await discardChanges.press('Enter');
	await expect(page).toHaveURL(new RegExp(`/compose/new[?]session=${session}$`));
	await expect(recipient).toHaveValue('');
	await expect(subject).toHaveValue('');
	await expect(body).toHaveValue('');
	await expect(draftState).toHaveText('Not saved yet');

	await recipient.fill('studio@northstar.test');
	await subject.fill('One durable draft');
	await body.fill('First version of the planning note.');
	await page.getByRole('button', { name: 'Save draft' }).click();
	await expect(page).toHaveURL(new RegExp(`/compose/draft-1[?]session=${session}$`));
	const savedDraftURL = page.url();
	await expect(body).toHaveValue('First version of the planning note.');

	await body.fill('Second version replaces the first without creating another draft.');
	await page.getByRole('button', { name: 'Save draft' }).click();
	await expect(draftState).toHaveText('Draft saved');
	await expect(page).toHaveURL(savedDraftURL);

	await page.getByRole('link', { name: /^Drafts,/ }).click();
	const savedDraft = page.getByRole('link', { name: /One durable draft/ });
	await expect(savedDraft).toHaveCount(1);
	await savedDraft.click();
	await expect(body).toHaveValue(
		'Second version replaces the first without creating another draft.',
	);
});

test('queues mail offline, retains it across route remounts, and delivers it on reconnect', async ({
	page,
	context,
}, testInfo) => {
	const session = sessionForAttempt('mailroom-offline', testInfo);
	await page.goto(`/compose/new?session=${session}`);
	const recipient = page.getByRole('textbox', { name: 'To' });
	await expect(recipient).toBeVisible();
	await context.setOffline(true);
	await page.evaluate(() => window.dispatchEvent(new Event('offline')));
	await expect(page.locator('.connection')).toContainText('Offline');

	await recipient.fill('crew@northstar.test');
	await page.getByRole('textbox', { name: 'Subject' }).fill('Offline launch note');
	await page
		.getByRole('textbox', { name: 'Message' })
		.fill('This message should wait safely until the connection returns.');
	const queue = page.getByRole('button', { name: 'Queue for later' });
	await queue.click();
	await expect(page).toHaveURL(new RegExp(`/mail/outbox[?]session=${session}$`));
	await expect(page.getByRole('link', { name: /Outbox/ })).toContainText('1');
	const queuedMessage = page.getByRole('list', { name: 'Queued messages' }).getByRole('listitem');
	await expect(queuedMessage).toContainText('Offline launch note');
	await expect(queuedMessage).toContainText('To crew@northstar.test');
	await expect(queuedMessage).toContainText(
		'This message should wait safely until the connection returns.',
	);
	await expect(page.getByText('Waiting for connection')).toBeVisible();

	await page.getByRole('link', { name: /Inbox/ }).click();
	await page.getByRole('link', { name: /Outbox/ }).click();
	await expect(queuedMessage).toContainText('Offline launch note');
	await expect(queuedMessage).toContainText('To crew@northstar.test');
	await expect(queuedMessage).toContainText(
		'This message should wait safely until the connection returns.',
	);

	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	await expect(page.getByText('Sending queued mail…')).toBeVisible();
	await expect(page.getByRole('heading', { level: 2, name: 'Outbox is clear' })).toBeVisible();
	await expect(page.getByRole('link', { name: /Outbox/ })).toContainText('0');

	await page.getByRole('link', { name: /Sent/ }).click();
	await page.getByRole('link', { name: /Offline launch note/ }).click();
	await expect(page.getByRole('heading', { level: 2, name: 'Offline launch note' })).toBeVisible();
	const deliveredMessage = page.getByRole('article', { name: 'Offline launch note' });
	await expect(deliveredMessage.getByText('to crew@northstar.test', { exact: true })).toBeVisible();
	await expect(
		deliveredMessage.getByText('This message should wait safely until the connection returns.'),
	).toBeVisible();
	await page.reload();
	await expect(page.getByRole('heading', { level: 2, name: 'Offline launch note' })).toBeVisible();
	await expect(deliveredMessage.getByText('to crew@northstar.test', { exact: true })).toBeVisible();
	await expect(
		deliveredMessage.getByText('This message should wait safely until the connection returns.'),
	).toBeVisible();
});

test('retries a loader failure and keeps empty, missing-message, and unknown-route states distinct', async ({
	page,
}, testInfo) => {
	const session = sessionForAttempt('mailroom-recovery', testInfo);
	await page.goto(`/mail/inbox?session=${session}&fault=load`);
	const alert = page.getByRole('alert');
	await expect(alert).toContainText('Let’s try that mailbox again');
	await expect(alert).toContainText('wrong turn');

	const retry = page.getByRole('button', { name: 'Retry mailbox' });
	await retry.focus();
	await retry.press('Enter');
	await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
	await expect(page.getByRole('link', { name: /The launch window is ours/ })).toBeVisible();

	await page.getByRole('link', { name: /Archive/ }).click();
	await expect(page.getByRole('heading', { level: 2, name: 'No mail in archive' })).toBeVisible();
	await expect(page.getByText('You are completely caught up.')).toBeVisible();

	await page.goto(`/mail/inbox/not-a-message?session=${session}`);
	await expect(page.getByRole('heading', { level: 2, name: 'Message not found' })).toBeVisible();
	await expect(
		page.getByRole('heading', { level: 2, name: 'The launch window is ours' }),
	).toHaveCount(0);

	await page.goto(`/rooms/unknown?session=${session}`);
	await expect(
		page.getByRole('heading', { level: 1, name: 'This room does not exist' }),
	).toBeVisible();
	await expect(page.getByRole('link', { name: 'Open inbox' })).toBeVisible();
});

test('keeps a slow shared fetcher alive across navigation and retries a rejected online send', async ({
	page,
}, testInfo) => {
	const session = sessionForAttempt('mailroom-overlap', testInfo);
	await page.goto(`/mail/inbox/launch-window?session=${session}&fault=slow-mutation`);

	await page.getByRole('button', { name: 'Remove star' }).click();
	await expect(page.getByText('Saving star…')).toBeVisible();
	await page.getByRole('link', { name: /Sent/ }).click();
	await expect(page).toHaveURL(/\/mail\/sent/);
	await expect(page.getByRole('heading', { level: 1, name: 'Sent' })).toBeVisible();
	await expect(page.getByText('1 message update in flight')).toBeVisible();
	await expect(page.getByText('Mailbox ready')).toBeVisible();

	await page.getByRole('link', { name: /Starred/ }).click();
	await expect(page.getByRole('link', { name: /The launch window is ours/ })).toHaveCount(0);

	await page.goto(`/compose/new?session=${session}&fault=send`);
	const recipient = page.getByRole('textbox', { name: 'To' });
	const subject = page.getByRole('textbox', { name: 'Subject' });
	const body = page.getByRole('textbox', { name: 'Message' });
	await recipient.fill('team@northstar.test');
	await subject.fill('Recovered delivery');
	await body.fill('The retry should preserve this complete message.');
	await page.getByRole('button', { name: 'Send now' }).click();
	await expect(page.getByRole('alert')).toContainText('delivery service paused');
	await expect(recipient).toHaveValue('team@northstar.test');
	await expect(subject).toHaveValue('Recovered delivery');
	await expect(body).toHaveValue('The retry should preserve this complete message.');

	await page.getByRole('button', { name: 'Send now' }).click();
	await expect(page).toHaveURL(new RegExp(`/mail/sent[?]session=${session}&fault=send$`));
	await expect(page.getByRole('link', { name: /Recovered delivery/ })).toBeVisible();
	await page.getByRole('link', { name: /Recovered delivery/ }).click();
	await expect(page.getByRole('heading', { level: 2, name: 'Recovered delivery' })).toBeVisible();
	await expect(
		page.locator('.message-body').getByText('The retry should preserve this complete message.'),
	).toBeVisible();
});
