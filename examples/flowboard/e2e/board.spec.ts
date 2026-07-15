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

async function openBoard(page: Page, path = '/board') {
	await page.goto(path);
	await expect(page.getByTestId('board-ready')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Flowboard', exact: true })).toBeVisible();
}

test('loads the deterministic board and recovers from an empty filtered view', async ({ page }) => {
	await page.goto('/board');
	await expect(page.getByLabel('Loading project board')).toHaveAttribute('aria-busy', 'true');
	await expect(page.getByTestId('board-ready')).toBeVisible();

	await expect(page.locator('[data-issue-id]')).toHaveCount(6);
	await expect(
		page.getByRole('region', { name: 'Backlog issues' }).locator('[data-issue-id]'),
	).toHaveCount(2);
	await expect(page.getByText('6 of 6 issues')).toBeVisible();

	await page.getByRole('searchbox', { name: 'Search issues' }).fill('no-such-issue');
	await expect(page.getByText('No issues match this view')).toBeVisible();
	await expect(page.locator('[data-issue-id]')).toHaveCount(0);

	await page.getByRole('button', { name: 'Clear filters' }).click();
	await expect(page.locator('[data-issue-id]')).toHaveCount(6);
});

test('opens a portaled issue route, restores focus, and supports a direct deep link', async ({
	page,
}) => {
	await openBoard(page);
	const trigger = page.getByRole('button', { name: /FLT-201 Ship project health signals/ });
	await trigger.click();

	await expect(page).toHaveURL(/\/issues\/FLT-201$/);
	const dialog = page.getByRole('dialog', { name: 'Ship project health signals' });
	await expect(dialog).toBeVisible();
	const closeButton = page.getByRole('button', { name: 'Close issue details' });
	const statusSelect = dialog.getByRole('combobox', { name: 'Issue status for FLT-201' });
	await expect(closeButton).toBeFocused();
	expect(await dialog.evaluate((element) => element.closest('#modal-root') !== null)).toBe(true);

	await page.keyboard.press('Shift+Tab');
	await expect(statusSelect).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(closeButton).toBeFocused();
	await trigger.evaluate((element) => (element as HTMLElement).focus());
	expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);

	await closeButton.click();
	await expect(page).toHaveURL(/\/board$/);
	await expect(trigger).toBeFocused();

	await page.goto('/issues/FLT-301');
	await expect(page.getByRole('dialog', { name: 'Verify offline issue edits' })).toBeVisible();
	await expect(page.getByText('Exercise local edits while disconnected')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page).toHaveURL(/\/board$/);
	await expect(page.getByRole('heading', { name: 'Flowboard', exact: true })).toBeFocused();
});

test('pointer dragging moves an issue while an unaffected keyed card keeps its DOM identity', async ({
	page,
}) => {
	await openBoard(page);
	const survivor = page.locator('[data-issue-id="FLT-102"]');
	await survivor.evaluate((element) => {
		(window as Window & { flowboardSurvivor?: Element }).flowboardSurvivor = element;
	});

	const handle = page.getByRole('button', { name: 'Drag FLT-101' });
	const review = page.getByRole('region', { name: 'Review issues' });
	const sourceBox = await handle.boundingBox();
	const targetBox = await review.boundingBox();
	if (!sourceBox || !targetBox) throw new Error('drag source and target must be visible');

	await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
	await page.mouse.down();
	await page.mouse.move(
		sourceBox.x + sourceBox.width / 2 + 12,
		sourceBox.y + sourceBox.height / 2 + 8,
		{ steps: 3 },
	);
	await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height - 32, {
		steps: 14,
	});
	await expect(page.getByTestId('drag-overlay-card')).toContainText('FLT-101');
	await page.mouse.up();

	await expect(page.locator('[data-issue-id="FLT-101"]')).toHaveAttribute('data-status', 'review');
	await expect(page.getByText('FLT-101 moved to Review')).toBeVisible();
	expect(
		await survivor.evaluate(
			(element) =>
				(window as Window & { flowboardSurvivor?: Element }).flowboardSurvivor === element,
		),
	).toBe(true);
});

test('keyboard dragging crosses columns while the accessible move control restores focus', async ({
	page,
}) => {
	await openBoard(page);
	await page.evaluate(() => {
		const left = document.querySelector('[data-issue-id="FLT-102"]');
		const target = document.querySelector('[data-issue-id="FLT-201"]');
		(
			window as Window & { flowboardKeyboardSurvivors?: { left: Element; target: Element } }
		).flowboardKeyboardSurvivors = { left: left!, target: target! };
	});

	const dragHandle = page.getByRole('button', { name: 'Drag FLT-101' });
	await dragHandle.focus();
	await page.keyboard.press('Space');
	await expect(page.getByTestId('drag-overlay-card')).toContainText('FLT-101');
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('Space');
	await expect(page.locator('[data-issue-id="FLT-101"]')).toHaveAttribute(
		'data-status',
		'in-progress',
	);
	await expect(page.getByText('FLT-101 moved to In progress')).toBeVisible();
	expect(
		await page.evaluate(() => {
			const survivors = (
				window as Window & { flowboardKeyboardSurvivors?: { left: Element; target: Element } }
			).flowboardKeyboardSurvivors;
			return (
				survivors?.left === document.querySelector('[data-issue-id="FLT-102"]') &&
				survivors?.target === document.querySelector('[data-issue-id="FLT-201"]')
			);
		}),
	).toBe(true);

	const moveControl = page.getByRole('button', { name: 'Move FLT-201 forward to Review' });
	await moveControl.focus();
	await page.keyboard.press('Enter');
	await expect(page.locator('[data-issue-id="FLT-201"]')).toHaveAttribute('data-status', 'review');
	await expect(page.getByRole('button', { name: 'Move FLT-201 forward to Done' })).toBeFocused();
	await expect(page.getByText('FLT-201 moved to Review')).toBeVisible();
	await expect(page.getByText('2 moves saved locally')).toBeVisible();
});

test('retries a fixture failure and accepts rapid local moves while offline', async ({
	page,
	context,
}) => {
	await page.goto('/board?scenario=failure');
	await expect(page.getByRole('alert')).toContainText('We couldn’t load the project board');
	await page.getByRole('button', { name: 'Retry loading' }).click();
	await expect(page.getByTestId('board-ready')).toBeVisible();

	await context.setOffline(true);
	await expect(page.getByText('Offline · changes stay local')).toBeVisible();
	await expect(page.getByText('Board moves remain available')).toBeVisible();

	await page.getByRole('combobox', { name: 'Set status for FLT-102' }).selectOption('in-progress');
	await page.getByRole('combobox', { name: 'Set status for FLT-102' }).selectOption('review');
	await page.getByRole('combobox', { name: 'Set status for FLT-102' }).selectOption('done');
	await expect(page.locator('[data-issue-id="FLT-102"]')).toHaveAttribute('data-status', 'done');
	await expect(page.getByText('3 moves saved locally')).toBeVisible();

	await context.setOffline(false);
	await expect(page.getByText('Synced', { exact: true })).toBeVisible();
});
