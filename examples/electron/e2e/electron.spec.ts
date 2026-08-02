import { type Locator, type Page, expect, test } from '@playwright/test';
import {
	type BrowserDiagnostics,
	collectBrowserDiagnostics,
	settleBrowserFrames,
} from '../../_shared/e2e/browser.ts';

const runtimeDiagnostics = new WeakMap<Page, BrowserDiagnostics>();

const LOG_LINE_COUNT = 8;
const FAST_INTERVAL_MS = 25;
const TOGGLE_INTERVAL_MS = 60;

function appUrl(params: Record<string, string | number> = {}): string {
	const search = new URLSearchParams(
		Object.entries({ interval: FAST_INTERVAL_MS, ...params }).map(([key, value]) => [
			key,
			String(value),
		]),
	);
	return `/?${search.toString()}`;
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

function logEntries(page: Page): Locator {
	return page.getByRole('list', { name: 'Task log' }).getByRole('listitem');
}

function runStatus(page: Page): Locator {
	return page.getByRole('status', { name: 'Run status' });
}

async function openTask(page: Page, name: string): Promise<void> {
	await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
	await expect(page.getByRole('button', { name: 'Run task' })).toBeVisible();
}

test('boots into the task index and reports which bridge answered', async ({ page }) => {
	await page.goto(appUrl());
	await expect(page.getByRole('heading', { name: 'Electron Shell' })).toBeVisible();
	await expect(page.getByText('Browser preview')).toBeVisible();

	const tasks = page.getByRole('list').first().getByRole('listitem');
	await expect(tasks).toHaveCount(3);
	await expect(page.getByText('Select a task to see how it runs.')).toBeVisible();
});

test('reads a task manifest and streams one run to completion', async ({ page }) => {
	await page.goto(appUrl());
	await openTask(page, 'Typecheck');

	await expect(page.getByText('tsrx-tsc --noEmit')).toBeVisible();
	await expect(runStatus(page)).toHaveText('Idle');

	await page.getByRole('button', { name: 'Run task' }).click();
	await expect(logEntries(page)).toHaveCount(LOG_LINE_COUNT);
	await expect(logEntries(page).last()).toHaveText('typecheck finished');
	await expect(runStatus(page)).toHaveText('Finished');
});

test('keeps each task log to its own selection', async ({ page }) => {
	await page.goto(appUrl());
	await openTask(page, 'Bundle');
	await page.getByRole('button', { name: 'Run task' }).click();
	await expect(logEntries(page)).toHaveCount(LOG_LINE_COUNT);

	await openTask(page, 'Migrate');
	await expect(page.getByText('electron-shell migrate --yes')).toBeVisible();
	await expect(logEntries(page)).toHaveCount(0);

	await page.getByRole('button', { name: 'Run task' }).click();
	await expect(logEntries(page)).toHaveCount(LOG_LINE_COUNT);
	await expect(logEntries(page).last()).toHaveText('migrate finished');
});

test('recovers the task index after its first load fails', async ({ page }) => {
	await page.goto(appUrl({ fault: 'list' }));
	const alert = page.getByRole('alert');
	await expect(alert).toContainText('the task index is locked by another process');

	await page.getByRole('button', { name: 'Retry task list' }).click();
	await expect(alert).toHaveCount(0);
	await expect(page.getByRole('button', { name: /^Typecheck/ })).toBeVisible();
});

test('recovers a task manifest that fails to load', async ({ page }) => {
	await page.goto(appUrl({ fault: 'describe' }));
	await page.getByRole('button', { name: /^Typecheck/ }).click();

	const alert = page.getByRole('alert');
	await expect(alert).toContainText('the task manifest could not be read');

	await page.getByRole('button', { name: 'Reload task manifest' }).click();
	await expect(alert).toHaveCount(0);
	await expect(page.getByText('tsrx-tsc --noEmit')).toBeVisible();
});

test('drops every line emitted while the log watcher is detached', async ({ page }) => {
	await page.goto(appUrl({ interval: TOGGLE_INTERVAL_MS }));
	await openTask(page, 'Typecheck');
	await page.getByRole('button', { name: 'Run task' }).click();
	await expect(logEntries(page).first()).toBeVisible();

	await page.getByRole('button', { name: 'Stop watching log' }).click();
	const frozen = await logEntries(page).count();
	expect(frozen).toBeLessThan(LOG_LINE_COUNT);

	await page.waitForTimeout(LOG_LINE_COUNT * TOGGLE_INTERVAL_MS + 200);
	await expect(logEntries(page)).toHaveCount(frozen);
	await expect(runStatus(page)).toHaveText('Running');

	await page.getByRole('button', { name: 'Watch log' }).click();
	await page.getByRole('button', { name: 'Run task' }).click();
	await expect(logEntries(page)).toHaveCount(LOG_LINE_COUNT);
	await expect(runStatus(page)).toHaveText('Finished');
});

test('reflects native theme and window state through the desktop hooks', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'light' });
	await page.goto(appUrl());
	await expect(page.locator('#host-theme')).toHaveText('light');
	await expect(page.locator('#host-title')).toHaveText('Electron Shell');
	await expect(page.locator('#host-maximized')).toHaveText('no');

	await page.emulateMedia({ colorScheme: 'dark' });
	await expect(page.locator('#host-theme')).toHaveText('dark');

	await page.getByRole('button', { name: 'Maximize window' }).click();
	await expect(page.locator('#host-maximized')).toHaveText('yes');

	await page.getByRole('button', { name: 'Set window title' }).click();
	await expect(page.locator('#host-title')).toHaveText('Shell — working');

	await page.getByRole('button', { name: 'Restore window' }).click();
	await expect(page.locator('#host-maximized')).toHaveText('no');
});

test('exercises app, dialog, clipboard, and shell helpers from the renderer', async ({ page }) => {
	await page.goto(appUrl());

	await page.getByRole('button', { name: 'Read app version' }).click();
	await expect(page.locator('#host-version')).toHaveText('0.0.0-browser');

	await page.getByRole('button', { name: 'Show message' }).click();
	await expect(page.locator('#host-dialog')).toHaveText('response 0');

	await page.getByRole('button', { name: 'Round-trip clipboard' }).click();
	await expect(page.locator('#host-clipboard')).toHaveText('shell-clipboard');

	await page.getByRole('button', { name: 'Open docs' }).click();
	await expect(page.locator('#host-opened')).toHaveText('https://octanejs.dev');
});

test('surfaces a refused run without leaving the task log running', async ({ page }) => {
	await page.goto(appUrl({ fault: 'run' }));
	await openTask(page, 'Typecheck');

	await page.getByRole('button', { name: 'Run task' }).click();
	await expect(page.getByRole('alert')).toContainText('the runner refused to start');
	await expect(runStatus(page)).toHaveText('Idle');
	await expect(logEntries(page)).toHaveCount(0);

	await page.getByRole('button', { name: 'Run task' }).click();
	await expect(logEntries(page)).toHaveCount(LOG_LINE_COUNT);
	await expect(runStatus(page)).toHaveText('Finished');
});
