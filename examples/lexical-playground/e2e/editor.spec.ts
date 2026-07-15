import { expect, test, type Page } from '@playwright/test';
import {
	collectBrowserDiagnostics,
	settleBrowserFrames,
	type BrowserDiagnostics,
} from '../../_shared/e2e/browser.ts';

const runtimeDiagnostics = new WeakMap<Page, BrowserDiagnostics>();

test.beforeEach(async ({ page }) => {
	runtimeDiagnostics.set(page, collectBrowserDiagnostics(page));

	await page.goto('/');
	await expect(page.getByRole('heading', { name: /Lexical Playground/ })).toBeVisible();
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

test('types and formats selected text', async ({ page }) => {
	const editor = page.getByRole('textbox', { name: 'Rich text editor' });
	await expect(editor).toBeFocused();

	await editor.fill('Octane makes rich text fast');
	await expect(editor).toHaveText('Octane makes rich text fast');

	await editor.press('ControlOrMeta+A');
	await page.getByRole('button', { name: 'Bold' }).click();

	await expect(editor.locator('strong')).toHaveText('Octane makes rich text fast');
	await expect(page.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
});

test('undo and redo restore the visible document', async ({ page }) => {
	const editor = page.getByRole('textbox', { name: 'Rich text editor' });
	const undo = page.getByRole('button', { name: 'Undo' });
	const redo = page.getByRole('button', { name: 'Redo' });

	await editor.fill('A reversible draft');
	await expect(undo).toBeEnabled();
	await undo.click();

	await expect(editor).toBeEmpty();
	await expect(page.getByText('Enter some rich text…')).toBeVisible();
	await expect(redo).toBeEnabled();

	await redo.click();
	await expect(editor).toHaveText('A reversible draft');
});

test('slash picker inserts a heading and removes the trigger text', async ({ page }) => {
	const editor = page.getByRole('textbox', { name: 'Rich text editor' });
	await editor.fill('/heading');

	const picker = page.getByRole('listbox', { name: 'Typeahead menu' });
	await expect(picker).toBeVisible();
	await page.getByRole('option', { name: 'Heading 2', exact: true }).click();
	await expect(picker).toBeHidden();

	await editor.pressSequentially('Release notes');
	await expect(editor.getByRole('heading', { level: 2 })).toHaveText('Release notes');
	await expect(editor).not.toContainText('/heading');
});
