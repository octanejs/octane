import { type Locator, type Page, expect, test } from '@playwright/test';
import {
	type BrowserDiagnostics,
	collectBrowserDiagnostics,
	settleBrowserFrames,
} from '../../_shared/e2e/browser.ts';

const runtimeDiagnostics = new WeakMap<Page, BrowserDiagnostics>();

const LOG_LINE_COUNT = 8;
/**
 * The app streams at 150ms per line so a person can read it. Journeys override
 * that: the run has to finish for the assertion, and waiting on a human-facing
 * cadence would spend most of the suite's wall clock doing nothing.
 */
const FAST_INTERVAL_MS = 25;
/** The detach journey has to land a click mid-run, so it keeps a wider gap. */
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
	await expect(page.getByRole('heading', { name: 'Workbench' })).toBeVisible();
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
	await expect(page.getByText('workbench migrate --yes')).toBeVisible();
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

	// Outlast the whole run. With no subscription behind the hook, not one
	// further line can land, so the completion line never arrives either.
	await page.waitForTimeout(LOG_LINE_COUNT * TOGGLE_INTERVAL_MS + 200);
	await expect(logEntries(page)).toHaveCount(frozen);
	await expect(runStatus(page)).toHaveText('Running');

	await page.getByRole('button', { name: 'Watch log' }).click();
	await page.getByRole('button', { name: 'Run task' }).click();
	await expect(logEntries(page)).toHaveCount(LOG_LINE_COUNT);
	await expect(runStatus(page)).toHaveText('Finished');
});
