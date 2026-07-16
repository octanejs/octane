import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
	collectBrowserDiagnostics,
	settleBrowserFrames,
	type BrowserDiagnostics,
} from '../../_shared/e2e/browser.ts';

const runtimeDiagnostics = new WeakMap<Page, BrowserDiagnostics>();
const WORKBOOK_STORAGE_KEY = 'gridlab:atlas-workbook:v1';

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

async function openGrid(page: Page, path = '/') {
	await page.goto(path);
	await expect(page.getByTestId('gridlab-ready')).toBeVisible();
	await expect(page.getByRole('grid', { name: 'Atlas forecast spreadsheet' })).toBeVisible();
}

function cell(page: Page, address: string) {
	return page.locator(`[data-cell="${address}"]`);
}

async function jumpTo(page: Page, address: string) {
	const nameBox = page.getByRole('textbox', { name: 'Cell address' });
	await nameBox.fill(address);
	await nameBox.press('Enter');
	await expect(cell(page, address.toUpperCase())).toBeFocused();
}

async function replaceCellFromFormulaBar(page: Page, address: string, value: string) {
	await jumpTo(page, address);
	const formula = page.getByRole('textbox', { name: `Formula for ${address.toUpperCase()}` });
	await formula.fill(value);
	await formula.press('Enter');
	await expect(cell(page, address.toUpperCase())).toBeFocused();
}

async function setOffline(context: BrowserContext, page: Page, offline: boolean) {
	await context.setOffline(offline);
	await expect(page.getByTestId('network-status')).toHaveText(offline ? 'Offline' : 'Online');
}

test('opens deterministic formulas, recovers an empty workbook, and stays usable on mobile', async ({
	page,
}) => {
	await page.addInitScript(
		({ key, marker }) => {
			if (sessionStorage.getItem(marker) !== null) return;
			localStorage.setItem(
				key,
				JSON.stringify({ version: 1, cells: { '1000:0': 'outside the workbook' } }),
			);
			sessionStorage.setItem(marker, 'seeded');
		},
		{ key: WORKBOOK_STORAGE_KEY, marker: 'gridlab-corrupt-storage-seeded' },
	);
	await page.goto('/');
	await expect(page.getByLabel('Loading Atlas forecast')).toHaveAttribute('aria-busy', 'true');
	await expect(page.getByTestId('gridlab-ready')).toBeVisible();
	await expect(cell(page, 'A1')).toHaveText('Atlas launch');
	await expect(cell(page, 'B1')).toHaveText('1200');
	await expect(cell(page, 'C1')).toHaveText('430');
	await expect(cell(page, 'D1')).toHaveText('770');
	await expect(page.getByText('1,000 rows × 80 columns')).toBeVisible();
	await expect(page.getByTestId('activity')).toHaveText(
		'Invalid local workbook ignored · sample loaded',
	);

	await replaceCellFromFormulaBar(page, 'B1', '2222');
	await expect(page.getByTestId('sync-status')).toHaveText('1 change queued');
	await expect(page.getByTestId('sync-status')).toHaveText('All changes saved', { timeout: 2_000 });
	await page.reload();
	await expect(page.getByTestId('gridlab-ready')).toBeVisible();
	await expect(page.getByTestId('activity')).toHaveText('1 saved cell restored');
	await expect(cell(page, 'B1')).toHaveText('2222');
	await expect(cell(page, 'D1')).toHaveText('1792');

	await page.goto('/?scenario=empty');
	await expect(page.getByTestId('empty-sheet')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'This sheet is empty' })).toBeVisible();
	await page.getByRole('button', { name: 'Restore sample workbook' }).click();
	await expect(page.getByTestId('gridlab-ready')).toBeVisible();
	await expect(cell(page, 'B1')).toHaveText('1200');
	await page.setViewportSize({ width: 390, height: 740 });
	await expect(page.getByRole('textbox', { name: 'Cell address' })).toBeVisible();
	await expect(cell(page, 'A1')).toBeVisible();
	await jumpTo(page, 'H20');
	await expect(cell(page, 'H20')).toBeInViewport();
});

test('virtualizes both axes while the focused selection survives distant scrolling', async ({
	page,
}) => {
	await openGrid(page);
	await cell(page, 'A1').click();
	await expect(cell(page, 'A1')).toBeFocused();
	const grid = page.getByRole('grid', { name: 'Atlas forecast spreadsheet' });
	await grid.evaluate((element) => {
		element.scrollTop = 400 * 34;
		element.scrollLeft = 45 * 132;
		element.dispatchEvent(new Event('scroll', { bubbles: true }));
	});
	await expect(page.locator('[data-row-header="401"]')).toBeVisible();
	await expect(page.locator('[data-column-header="AT"]')).toBeVisible();
	await expect(cell(page, 'B1')).toHaveCount(0);
	await expect(cell(page, 'A2')).toHaveCount(0);
	await expect(cell(page, 'A1')).toBeFocused();
	expect(await grid.evaluate((element) => element.scrollTop)).toBeGreaterThan(10_000);
	expect(await grid.evaluate((element) => element.scrollLeft)).toBeGreaterThan(5_000);

	await jumpTo(page, 'AZ750');
	await expect(cell(page, 'AZ750')).toBeInViewport();
	await expect(page.locator('[data-row-header="750"]')).toBeVisible();
	await expect(page.locator('[data-column-header="AZ"]')).toBeVisible();
	await page.keyboard.press('PageDown');
	await expect(cell(page, 'AZ764')).toBeFocused();
	await expect(cell(page, 'AZ764')).toBeInViewport();
});

test('copies a native range and pastes a tabular selection without losing cell focus', async ({
	page,
}) => {
	await openGrid(page);
	await cell(page, 'A1').click();
	await page.keyboard.press('Shift+ArrowRight');
	await expect(cell(page, 'A1')).toHaveAttribute('aria-selected', 'true');
	await expect(cell(page, 'B1')).toBeFocused();
	await page.keyboard.press('ControlOrMeta+c');
	await expect(page.getByTestId('activity')).toHaveText('A1:B1 copied to clipboard');
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Atlas launch\t1200');

	await jumpTo(page, 'A4');
	await page.evaluate(() => navigator.clipboard.writeText('North star\t2400\nRetention\t900'));
	await page.keyboard.press('ControlOrMeta+v');
	await expect(page.getByTestId('activity')).toHaveText('4 pasted cells from clipboard');
	await expect(cell(page, 'A4')).toHaveText('North star');
	await expect(cell(page, 'B4')).toHaveText('2400');
	await expect(cell(page, 'A5')).toHaveText('Retention');
	await expect(cell(page, 'B5')).toHaveText('900');
	await expect(cell(page, 'D4')).toHaveText('1703');
	await expect(cell(page, 'B5')).toBeFocused();
	await expect(cell(page, 'B5')).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('textbox', { name: 'Cell address' })).toHaveValue('B5');
	await expect(page.getByRole('textbox', { name: 'Formula for B5' })).toHaveValue('900');
	await page.keyboard.press('ArrowRight');
	await expect(cell(page, 'C5')).toBeFocused();
	await expect(page.getByRole('textbox', { name: 'Cell address' })).toHaveValue('C5');

	await jumpTo(page, 'A1');
	await page.keyboard.press('Enter');
	const editor = page.getByRole('textbox', { name: 'Edit A1' });
	await editor.fill('Draft text for clipboard');
	await editor.selectText();
	await page.keyboard.press('ControlOrMeta+c');
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
		'Draft text for clipboard',
	);
	await expect(page.getByTestId('activity')).toHaveText('A1 selected');
	await page.evaluate(() => navigator.clipboard.writeText('Pasted only into editor'));
	await editor.selectText();
	await page.keyboard.press('ControlOrMeta+v');
	await expect(editor).toHaveValue('Pasted only into editor');
	await expect(page.getByTestId('activity')).toHaveText('A1 selected');
	await page.keyboard.press('Enter');
	await expect(cell(page, 'A1')).toHaveText('Pasted only into editor');
	await expect(cell(page, 'A2')).toBeFocused();
});

test('keeps IME composition inside the editor and recalculates committed formulas', async ({
	page,
}) => {
	await openGrid(page);
	await cell(page, 'B1').click();
	await page.keyboard.press('Enter');
	const editor = page.getByRole('textbox', { name: 'Edit B1' });
	await expect(editor).toBeFocused();
	await editor.dispatchEvent('compositionstart', { data: '' });
	await editor.evaluate((element) => {
		const input = element as HTMLInputElement;
		input.value = '予算';
		input.dispatchEvent(
			new InputEvent('input', {
				bubbles: true,
				data: '予算',
				inputType: 'insertCompositionText',
				isComposing: true,
			}),
		);
	});
	await page.keyboard.press('Enter');
	await expect(editor).toBeFocused();
	await expect(editor).toHaveValue('予算');
	await editor.dispatchEvent('compositionend', { data: '予算' });
	await page.keyboard.press('Enter');
	await expect(cell(page, 'B1')).toHaveText('予算');
	await expect(cell(page, 'B2')).toBeFocused();
	await expect(cell(page, 'D1')).toHaveText('#VALUE!');

	await replaceCellFromFormulaBar(page, 'B1', '1500');
	await expect(cell(page, 'D1')).toHaveText('1070');
	await replaceCellFromFormulaBar(page, 'D1', '=SUM(B1:C1)');
	await expect(cell(page, 'D1')).toHaveText('1930');
});

test('retries loading and sync without dropping rapid edits across an offline interleaving', async ({
	context,
	page,
}) => {
	await page.goto('/?scenario=recovery');
	await expect(page.getByRole('heading', { name: 'Couldn’t open this workbook' })).toBeVisible();
	await page.getByRole('button', { name: 'Retry opening workbook' }).click();
	await expect(page.getByTestId('gridlab-ready')).toBeVisible();

	await setOffline(context, page, true);
	await replaceCellFromFormulaBar(page, 'A1', 'First draft');
	await replaceCellFromFormulaBar(page, 'A1', 'Latest draft');
	await replaceCellFromFormulaBar(page, 'B1', '1600');
	await expect(page.getByTestId('sync-status')).toHaveText('2 changes stored locally');
	await expect(cell(page, 'A1')).toHaveText('Latest draft');
	await expect(cell(page, 'D1')).toHaveText('1170');

	await setOffline(context, page, false);
	await expect(page.getByTestId('sync-status')).toContainText('Saving 2 changes');
	await replaceCellFromFormulaBar(page, 'A1', 'Final plan');
	await expect(page.getByTestId('sync-status')).toHaveText('Sync paused · 2 pending', {
		timeout: 2_000,
	});
	await expect(page.getByRole('button', { name: 'Retry sync' })).toBeVisible();
	await expect(cell(page, 'A1')).toHaveText('Final plan');
	await page.getByRole('button', { name: 'Retry sync' }).click();
	await expect(page.getByTestId('sync-status')).toContainText('Saving 2 changes');
	await replaceCellFromFormulaBar(page, 'A1', 'Post-retry revision');
	await expect(page.getByTestId('sync-status')).toHaveText('1 change queued', { timeout: 2_000 });
	await expect(page.getByTestId('activity')).toHaveText('1 newer change still queued');
	await expect(page.getByTestId('sync-status')).toHaveText('All changes saved', { timeout: 2_000 });
	await expect(cell(page, 'A1')).toHaveText('Post-retry revision');
	await expect(cell(page, 'B1')).toHaveText('1600');
	await expect(cell(page, 'D1')).toHaveText('1170');
	await page.evaluate(() => history.replaceState(null, '', '/'));
	await page.reload();
	await expect(page.getByTestId('gridlab-ready')).toBeVisible();
	await expect(page.getByTestId('activity')).toHaveText('2 saved cells restored');
	await expect(cell(page, 'A1')).toHaveText('Post-retry revision');
	await expect(cell(page, 'B1')).toHaveText('1600');
	await expect(cell(page, 'D1')).toHaveText('1170');
});
