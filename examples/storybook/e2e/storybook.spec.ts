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
		for (const frame of page.frames()) await settleBrowserFrames(frame);
		diagnostics.assertClean(testInfo.title);
	} finally {
		diagnostics.stop();
	}
});

test('live-controls: updates native props and styles while preserving the counter state', async ({
	page,
}) => {
	await page.goto('/?path=/story/octane-counter--default');
	await expect(page.getByRole('link', { name: 'Default', exact: true })).toHaveAttribute(
		'href',
		'/?path=/story/octane-counter--default',
	);
	const preview = page.frameLocator('#storybook-preview-iframe');
	const counter = preview.getByRole('region', { name: 'Octane counter' });
	const count = counter.locator('output');
	await expect(counter.getByRole('heading', { name: 'Native Octane counter' })).toBeVisible();
	await expect(counter).toHaveCSS('background-color', 'rgb(15, 23, 42)');
	await expect(counter).toHaveCSS('display', 'grid');
	await expect(count).toHaveText('Count: 0');
	await counter.getByRole('button', { name: 'Increment', exact: true }).click();
	await expect(count).toHaveText('Count: 1');

	await page.locator('#control-label').fill('Add three');
	await page.locator('#control-label').press('Tab');
	const action = counter.getByRole('button', { name: 'Add three', exact: true });
	await expect(action).toBeVisible();
	await expect(count).toHaveText('Count: 1');
	await page.locator('#control-step').fill('3');
	await page.locator('#control-step').press('Tab');
	await expect(counter.getByText('Step: 3', { exact: true })).toBeVisible();
	await expect(count).toHaveText('Count: 1');
	await action.click();
	await expect(count).toHaveText('Count: 4');

	await page.getByText('True', { exact: true }).click();
	await expect(action).toBeDisabled();
	await expect(action).toHaveCSS('opacity', '0.5');
	await action.evaluate((element) => (element as HTMLButtonElement).click());
	await expect(count).toHaveText('Count: 4');
	await page.getByText('False', { exact: true }).click();
	await expect(action).toBeEnabled();
	await expect(action).toHaveCSS('opacity', '1');
	await action.click();
	await expect(count).toHaveText('Count: 7');
});

test('story-lifecycle: removes the previous subtree and remounts fresh state on return', async ({
	page,
}) => {
	await page.goto('/?path=/story/octane-counter--default');
	const preview = page.frameLocator('#storybook-preview-iframe');
	const counter = preview.getByRole('region', { name: 'Octane counter' });
	const count = counter.locator('output');
	await expect(count).toHaveText('Count: 0');
	await counter.getByRole('button', { name: 'Increment', exact: true }).click();
	await expect(count).toHaveText('Count: 1');
	const defaultCounter = await counter.elementHandle();
	if (defaultCounter === null) throw new Error('expected the default counter');

	await page.getByRole('link', { name: 'Large Step', exact: true }).click();
	await expect(page).toHaveURL(/\?path=\/story\/octane-counter--large-step$/);
	await expect(count).toHaveText('Count: 0');
	await expect(counter.getByText('Step: 5', { exact: true })).toBeVisible();
	expect(await defaultCounter.evaluate((element) => element.isConnected)).toBe(false);
	await counter.getByRole('button', { name: 'Add five', exact: true }).click();
	await expect(count).toHaveText('Count: 5');
	const largeStepCounter = await counter.elementHandle();
	if (largeStepCounter === null) throw new Error('expected the large-step counter');

	await page.getByRole('link', { name: 'Default', exact: true }).click();
	await expect(page).toHaveURL(/\?path=\/story\/octane-counter--default$/);
	await expect(count).toHaveText('Count: 0');
	await expect(counter.getByText('Step: 1', { exact: true })).toBeVisible();
	expect(await largeStepCounter.evaluate((element) => element.isConnected)).toBe(false);
	await counter.getByRole('button', { name: 'Increment', exact: true }).click();
	await expect(count).toHaveText('Count: 1');
});
