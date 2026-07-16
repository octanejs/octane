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

test('opens deep-linked documents and keeps keyboard navigation focused on mobile', async ({
	page,
}, testInfo) => {
	const session = sessionForAttempt('pagecraft-navigation', testInfo);
	await page.setViewportSize({ width: 620, height: 820 });
	await page.goto(`/documents/field-notes?session=${session}`);

	const editor = page.getByRole('textbox', { name: 'Document body' });
	await expect(editor).toContainText('People protect their focus');
	await expect(page.getByRole('link', { name: /Field notes/ })).toHaveAttribute(
		'aria-current',
		'page',
	);

	const launchLink = page.locator('.document-link[href^="/documents/launch-brief"]');
	await launchLink.focus();
	await launchLink.press('Enter');
	await expect(page).toHaveURL(new RegExp(`/documents/launch-brief\\?session=${session}$`));
	await expect(page.getByRole('status')).toContainText('Opening document');
	await expect(editor).toContainText('A quieter way to launch');
	await expect(launchLink).toBeFocused();
	await expect(launchLink).toHaveAttribute('aria-current', 'page');
	await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue('Launch brief');

	const flushedSave = page.waitForResponse(
		(response) =>
			response.request().method() === 'PUT' &&
			response.request().postData()?.includes('A renamed launch plan') === true &&
			response.request().postData()?.includes('A navigation draft that cannot disappear') === true,
	);
	await editor.fill('A navigation draft that cannot disappear');
	await page.getByRole('textbox', { name: 'Document title' }).fill('A renamed launch plan');
	await page.getByRole('link', { name: /Field notes/ }).click();
	await expect(page).toHaveURL(/\/documents\/field-notes/);
	await flushedSave;
	await expect(launchLink).toContainText('A renamed launch plan');
	await launchLink.click();
	await expect(editor).toHaveText('A navigation draft that cannot disappear');
	await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue(
		'A renamed launch plan',
	);
	await expect(page.getByRole('status')).toContainText('All changes saved');
	await page.reload();
	await expect(editor).toHaveText('A navigation draft that cannot disappear');
	await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue(
		'A renamed launch plan',
	);
	await expect(launchLink).toContainText('A renamed launch plan');
});

test('formats a live selection, preserves editor focus, and restores history before autosaving', async ({
	page,
}, testInfo) => {
	const session = sessionForAttempt('pagecraft-formatting', testInfo);
	await page.goto(`/documents/blank-page?session=${session}`);
	const editor = page.getByRole('textbox', { name: 'Document body' });
	await expect(page.getByRole('heading', { level: 1, name: 'Blank page' })).toBeVisible();
	await expect(page.getByText('Start with a thought, a question, or a title…')).toBeVisible();

	await editor.fill('A reversible sentence');
	await editor.press('ControlOrMeta+A');
	const bold = page.getByRole('button', { name: 'Bold' });
	await bold.click();
	await expect(editor).toBeFocused();
	await expect(editor.locator('strong')).toHaveText('A reversible sentence');
	await expect(bold).toHaveAttribute('aria-pressed', 'true');

	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(editor.locator('strong')).toHaveCount(0);
	await expect(editor).toHaveText('A reversible sentence');
	await page.getByRole('button', { name: 'Redo' }).click();
	await expect(editor.locator('strong')).toHaveText('A reversible sentence');
	await expect(page.getByRole('status')).toContainText('All changes saved');

	await page.reload();
	await expect(editor.locator('strong')).toHaveText('A reversible sentence');

	const title = page.getByRole('textbox', { name: 'Document title' });
	await title.fill('');
	await expect(title).toHaveAttribute('aria-invalid', 'true');
	expect(await title.evaluate((element) => (element as HTMLInputElement).checkValidity())).toBe(
		false,
	);
	await expect(page.getByRole('status')).toContainText('Title required · not saved');
	await expect(page.getByRole('alert')).toContainText('Add a title before saving');
	await expect(page.getByRole('heading', { level: 1, name: 'Untitled document' })).toBeVisible();
	await page.reload();
	await expect(title).toHaveValue('Blank page');
	await expect(page.getByRole('heading', { level: 1, name: 'Blank page' })).toBeVisible();
	await expect(editor.locator('strong')).toHaveText('A reversible sentence');
});

test('keeps the newest draft when overlapping autosaves settle out of order', async ({
	page,
}, testInfo) => {
	const session = sessionForAttempt('pagecraft-overlap', testInfo);
	await page.goto(`/documents/blank-page?session=${session}`);
	const editor = page.getByRole('textbox', { name: 'Document body' });
	const firstStarted = page.waitForRequest(
		(request) =>
			request.method() === 'PUT' && request.postData()?.includes('First slow draft') === true,
	);
	await editor.fill('First slow draft');
	await firstStarted;
	await page.getByRole('link', { name: /Field notes/ }).click();
	await expect(page).toHaveURL(/\/documents\/field-notes/);
	await page.getByRole('link', { name: /Blank page/ }).click();
	await expect(editor).toHaveText('First slow draft');

	const secondFinished = page.waitForResponse(
		(response) =>
			response.request().method() === 'PUT' &&
			response.request().postData()?.includes('Second fast draft') === true,
	);
	const firstFinished = page.waitForResponse(
		(response) =>
			response.request().method() === 'PUT' &&
			response.request().postData()?.includes('First slow draft') === true,
	);
	await editor.fill('Second fast draft');
	await secondFinished;
	await expect(page.getByRole('status')).toContainText('All changes saved');
	await firstFinished;
	await expect(page.getByRole('status')).toContainText('All changes saved');

	await page.reload();
	await expect(editor).toHaveText('Second fast draft');
	await expect(editor).not.toContainText('First slow draft');
});

test('recovers a rejected save and carries offline edits through reconnection', async ({
	page,
	context,
}, testInfo) => {
	const session = sessionForAttempt('pagecraft-recovery', testInfo);
	await page.goto(`/documents/launch-brief?session=${session}&fault=save`);
	const editor = page.getByRole('textbox', { name: 'Document body' });
	const failedSave = page.waitForResponse(
		(response) =>
			response.request().method() === 'PUT' &&
			response.request().postData()?.includes('A deliberate save pause') === true,
	);
	await editor.fill('A deliberate save pause');
	const failedResponse = await failedSave;
	const failedVersion = (failedResponse.request().postDataJSON() as { version: number }).version;
	expect(failedVersion).toBe(1);
	const saveAlert = page.getByRole('alert');
	await expect(saveAlert).toContainText('We could not autosave');
	await expect(saveAlert).toContainText('Autosave paused');

	await page.reload();
	await expect(editor).toContainText('A quieter way to launch');
	const recoveredSave = page.waitForResponse(
		(response) =>
			response.request().method() === 'PUT' &&
			response.request().postData()?.includes('Recovered after reusing the next version') === true,
	);
	await editor.fill('Recovered after reusing the next version');
	const recoveredResponse = await recoveredSave;
	expect((recoveredResponse.request().postDataJSON() as { version: number }).version).toBe(
		failedVersion,
	);
	await expect(recoveredResponse.json()).resolves.toMatchObject({
		ok: true,
		applied: true,
		version: failedVersion,
	});
	await expect(page.getByRole('status')).toContainText('All changes saved');
	await page.reload();
	await expect(editor).toHaveText('Recovered after reusing the next version');

	await context.setOffline(true);
	await editor.fill('An offline note that stays with me');
	await expect(page.getByRole('status')).toContainText('Offline · edits stay here');
	await expect(editor).toHaveText('An offline note that stays with me');
	await context.setOffline(false);
	await expect(page.getByRole('status')).toContainText('All changes saved');

	await page.reload();
	await expect(editor).toHaveText('An offline note that stays with me');
});

test('retries a failed load, opens an intentional blank page, and rejects stale content for missing links', async ({
	page,
}, testInfo) => {
	const session = sessionForAttempt('pagecraft-loading', testInfo);
	await page.goto(`/documents/field-notes?session=${session}&fault=load`);
	const alert = page.getByRole('alert');
	await expect(alert).toContainText('Let’s try that document again');
	await expect(alert).toContainText('wrong turn');

	const retry = page.getByRole('button', { name: 'Retry opening' });
	await retry.focus();
	await retry.press('Enter');
	const editor = page.getByRole('textbox', { name: 'Document body' });
	await expect(editor).toContainText('People protect their focus');

	await page.getByRole('link', { name: /Blank page/ }).click();
	await expect(page.getByRole('textbox', { name: 'Document body' })).toBeEmpty();
	await expect(page.getByText('Start with a thought, a question, or a title…')).toBeVisible();

	const malformedEditorState = JSON.stringify({
		root: {
			children: [{ type: 'unknown-pagecraft-node', version: 1 }],
			direction: 'ltr',
			format: '',
			indent: 0,
			type: 'root',
			version: 1,
		},
	});
	const rejectedSave = (await page.evaluate(
		async ({ editorState, session }) => {
			const response = await fetch(
				`/api/documents/blank-page?session=${encodeURIComponent(session)}`,
				{
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						title: 'Corrupt replacement',
						editorState,
						plainText: 'This must never persist',
						version: 999,
					}),
				},
			);
			return response.json();
		},
		{ editorState: malformedEditorState, session },
	)) as { ok: boolean; message: string };
	expect(rejectedSave.ok).toBe(false);
	expect(rejectedSave.message).toContain('invalid');
	await page.reload();
	await expect(page.getByRole('textbox', { name: 'Document body' })).toBeEmpty();

	await page.evaluate(() => {
		const scope = window as Window & {
			pagecraftLeakObserver?: MutationObserver;
			pagecraftLeaks?: string[];
			pagecraftRestoreHistory?: () => void;
		};
		scope.pagecraftLeaks = [];
		const inspect = (pathname = window.location.pathname, phase = 'mutation') => {
			const title = document.querySelector<HTMLInputElement>('[aria-label="Document title"]');
			if (
				pathname.endsWith('/editorial-calendar') &&
				title &&
				title.value !== 'Editorial calendar'
			) {
				scope.pagecraftLeaks?.push(`${phase}:editorial:${title.value}`);
			}
			if (pathname.endsWith('/a-page-that-never-existed') && title) {
				scope.pagecraftLeaks?.push(`${phase}:missing:${title.value}`);
			}
		};
		const inspectAtNextPaint = () => {
			const pathname = window.location.pathname;
			window.requestAnimationFrame(() => inspect(pathname, 'paint'));
		};
		const pushState = window.history.pushState.bind(window.history);
		window.history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
			pushState(data, unused, url);
			inspectAtNextPaint();
		};
		scope.pagecraftRestoreHistory = () => {
			window.history.pushState = pushState;
		};
		scope.pagecraftLeakObserver = new MutationObserver(() => inspect());
		scope.pagecraftLeakObserver.observe(document.getElementById('document-workspace')!, {
			childList: true,
			characterData: true,
			subtree: true,
		});
	});

	let corruptLoad = true;
	await page.route('**/api/documents/editorial-calendar?**', async (route) => {
		if (!corruptLoad) {
			await route.continue();
			return;
		}
		corruptLoad = false;
		await route.fulfill({
			json: {
				ok: true,
				document: {
					id: 'editorial-calendar',
					title: 'Editorial calendar',
					eyebrow: 'Planning',
					updatedAt: 'Edited Monday',
					editorState: malformedEditorState,
					version: 0,
				},
			},
		});
	});
	await page.getByRole('link', { name: /Editorial calendar/ }).click();
	await expect(page.getByRole('alert')).toContainText('invalid editor data');
	await expect(page.getByRole('textbox', { name: 'Document body' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Retry opening' }).click();
	await expect(page.getByRole('textbox', { name: 'Document body' })).toContainText(
		'Three stories for late summer',
	);

	await page.evaluate((session) => {
		window.history.pushState(
			{},
			'',
			`/documents/a-page-that-never-existed?session=${encodeURIComponent(session)}`,
		);
		window.dispatchEvent(new PopStateEvent('popstate'));
	}, session);
	await expect(page.getByRole('alert')).toContainText('That document is not in this workspace');
	await expect(page.getByRole('textbox', { name: 'Document body' })).toHaveCount(0);
	expect(
		await page.evaluate(() => {
			const scope = window as Window & {
				pagecraftLeakObserver?: MutationObserver;
				pagecraftLeaks?: string[];
				pagecraftRestoreHistory?: () => void;
			};
			scope.pagecraftLeakObserver?.disconnect();
			scope.pagecraftRestoreHistory?.();
			return scope.pagecraftLeaks ?? [];
		}),
	).toEqual([]);
});
