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
	await expect(page.getByRole('heading', { name: /Monaco Playground/ })).toBeVisible();
	await page.locator('[data-editor-ready="true"]').waitFor({ timeout: 60_000 });
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

test('types into the editor and updates the controlled preview', async ({ page }) => {
	const editor = page.locator('.monaco-editor').first();
	await expect(editor).toBeVisible();
	await page.waitForFunction(() =>
		Boolean(
			(globalThis as { __monacoPlaygroundEditor?: { getValue(): string } })
				.__monacoPlaygroundEditor,
		),
	);
	await page.evaluate(() => {
		const instance = (
			globalThis as {
				__monacoPlaygroundEditor?: {
					executeEdits(source: string, edits: Array<{ range: unknown; text: string }>): void;
					getModel(): { getFullModelRange(): unknown } | null;
					pushUndoStop(): void;
				};
			}
		).__monacoPlaygroundEditor;
		const model = instance?.getModel();
		if (!instance || !model) throw new Error('monaco editor missing');
		instance.executeEdits('', [{ range: model.getFullModelRange(), text: 'const x = 1;\n' }]);
		instance.pushUndoStop();
	});
	await expect(page.getByTestId('value-preview')).toContainText('const x = 1;');
});

test('toggles theme and language without losing the editor', async ({ page }) => {
	await page.getByLabel('Theme').selectOption('vs-dark');
	await page.getByLabel('Language').selectOption('javascript');
	await expect(page.locator('.monaco-editor').first()).toBeVisible();
	await expect(page.getByTestId('ready-flag')).toHaveText('ready');
	await expect
		.poll(
			async () =>
				page.evaluate(() => {
					const editor = (
						globalThis as {
							__monacoPlaygroundEditor?: {
								getModel(): { getLanguageId(): string } | null;
							};
						}
					).__monacoPlaygroundEditor;
					return editor?.getModel()?.getLanguageId() ?? null;
				}),
			{ timeout: 15_000 },
		)
		.toBe('javascript');
});

test('mounts DiffEditor panes', async ({ page }) => {
	const diff = page.getByTestId('diff-frame').locator('.monaco-diff-editor');
	await expect(diff).toBeVisible({ timeout: 60_000 });
});

test('keeps controlled preview after language worker switch', async ({ page }) => {
	await page.getByLabel('Language').selectOption('json');
	await page.evaluate(() => {
		const instance = (
			globalThis as {
				__monacoPlaygroundEditor?: {
					executeEdits(source: string, edits: Array<{ range: unknown; text: string }>): void;
					getModel(): { getFullModelRange(): unknown } | null;
					pushUndoStop(): void;
				};
			}
		).__monacoPlaygroundEditor;
		const model = instance?.getModel();
		if (!instance || !model) throw new Error('monaco editor missing');
		instance.executeEdits('', [{ range: model.getFullModelRange(), text: '{"ok":true}\n' }]);
		instance.pushUndoStop();
	});
	await expect(page.getByTestId('value-preview')).toContainText('"ok":true');
	await expect
		.poll(
			async () =>
				page.evaluate(() => {
					const editor = (
						globalThis as {
							__monacoPlaygroundEditor?: {
								getModel(): { getLanguageId(): string } | null;
							};
						}
					).__monacoPlaygroundEditor;
					return editor?.getModel()?.getLanguageId() ?? null;
				}),
			{ timeout: 15_000 },
		)
		.toBe('json');
});
