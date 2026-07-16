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

async function openDashboard(page: Page, path = '/workspaces/northstar/overview?range=7d') {
	await page.goto(path, { waitUntil: 'commit' });
	await expect(page.getByLabel('Loading Pulseboard analytics')).toHaveAttribute(
		'aria-busy',
		'true',
	);
	await expect(page.getByTestId('pulseboard-ready')).toBeVisible();
}

async function measuredChartWidth(page: Page): Promise<number> {
	const label = await page.getByLabel('Chart measured width').textContent();
	const match = label?.match(/(\d+)\s*px/);
	if (!match) throw new Error(`missing chart measurement in ${JSON.stringify(label)}`);
	return Number(match[1]);
}

test('loads a measured deep link and keeps chart geometry responsive across report navigation', async ({
	page,
}) => {
	await openDashboard(page, '/workspaces/northstar/acquisition?range=30d');
	await expect(page).toHaveURL(/\/workspaces\/northstar\/acquisition\?range=30d$/);
	await expect(page.getByRole('heading', { name: 'Acquisition health' })).toBeVisible();
	const chart = page.getByRole('group', { name: 'Visitors trend, last 30 days' });
	await expect(chart).toBeVisible();
	await expect(chart.getByRole('button')).toHaveCount(30);
	await chart.getByRole('button', { name: 'Jun 16: 1,509 visitors, 92 conversions' }).hover();
	const pointerReading = page.getByRole('status').filter({ hasText: 'Jun 16' });
	await expect(pointerReading).toContainText('1,509 visitors');
	await expect(pointerReading).toContainText('92 conversions');
	const desktopWidth = await measuredChartWidth(page);
	expect(desktopWidth).toBeGreaterThan(620);
	const desktopBox = await chart.boundingBox();
	if (!desktopBox) throw new Error('measured chart must have a browser layout box');

	await page.getByRole('link', { name: 'Revenue' }).click();
	await expect(page).toHaveURL(/\/workspaces\/northstar\/revenue\?range=30d$/);
	await expect(page.getByRole('heading', { name: 'Revenue momentum' })).toBeVisible();
	await expect(page.getByText('$824.6k')).toBeVisible();

	const globalSearch = page.getByRole('searchbox', { name: 'Search Pulseboard' });
	await globalSearch.fill('growth overview');
	const searchResults = page.getByRole('region', { name: 'Pulseboard search results' });
	await expect(searchResults).toBeVisible();
	await searchResults.getByRole('button', { name: /Growth overview/ }).click();
	await expect(page).toHaveURL(/\/workspaces\/northstar\/overview\?range=30d$/);
	await expect(page.getByRole('heading', { name: 'Growth overview' })).toBeVisible();
	await expect(globalSearch).toHaveValue('');
	await globalSearch.fill('live activity');
	await searchResults.getByRole('button', { name: /Live activity/ }).click();
	await expect(page.getByRole('region', { name: 'Live activity' })).toBeFocused();
	await expect(globalSearch).toHaveValue('');

	await page.getByRole('button', { name: 'Open notifications, 3 unread' }).click();
	const notifications = page.getByRole('region', { name: 'Notifications' });
	await expect(notifications.getByRole('listitem')).toHaveCount(3);
	await notifications.getByRole('button', { name: 'Mark all as read' }).click();
	await expect(notifications.getByRole('status')).toHaveText('You’re all caught up');
	await expect(page.getByRole('button', { name: 'Close notifications, 0 unread' })).toBeVisible();

	await page.setViewportSize({ width: 520, height: 900 });
	await expect.poll(() => measuredChartWidth(page)).toBeLessThan(desktopWidth - 120);
	const compactChart = page.getByRole('group', { name: 'Visitors trend, last 30 days' });
	const compactBox = await compactChart.boundingBox();
	if (!compactBox) throw new Error('compact chart must remain laid out');
	expect(compactBox.width).toBeLessThan(desktopBox.width);
	expect(compactBox.width).toBeGreaterThan(300);
});

test('supports compact keyboard chart exploration while rapid range requests converge to the latest choice', async ({
	page,
}) => {
	await page.setViewportSize({ width: 560, height: 900 });
	await openDashboard(page);
	await page.keyboard.press('Tab');
	await expect(page.getByRole('link', { name: 'Skip to analytics' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.locator('#main-content')).toBeFocused();
	const navigationButton = page.getByRole('button', { name: 'Pulseboard navigation' });
	await navigationButton.focus();
	await page.keyboard.press('Enter');
	await expect(navigationButton).toHaveAttribute('aria-expanded', 'true');
	await expect(page.getByRole('link', { name: 'Overview', exact: true })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('link', { name: 'Acquisition', exact: true })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('heading', { name: 'Acquisition health' })).toBeVisible();
	await expect(navigationButton).toHaveAttribute('aria-expanded', 'false');
	await navigationButton.click();
	await page.getByRole('link', { name: 'Overview', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Growth overview' })).toBeVisible();

	let chart = page.getByRole('group', { name: 'Visitors trend, last 7 days' });
	const lastPoint = chart.getByRole('button', {
		name: 'Jul 15: 3,824 visitors, 309 conversions',
	});
	await lastPoint.focus();
	await expect(lastPoint).toBeFocused();
	await page.keyboard.press('Home');
	const firstPoint = chart.getByRole('button', {
		name: 'Jul 9: 3,268 visitors, 251 conversions',
	});
	await expect(firstPoint).toBeFocused();
	await expect(page.getByRole('status').filter({ hasText: 'Jul 9' })).toContainText(
		'3,268 visitors',
	);
	await page.keyboard.press('ArrowRight');
	const secondPoint = chart.getByRole('button', {
		name: 'Jul 10: 3,342 visitors, 260 conversions',
	});
	await expect(secondPoint).toBeFocused();

	const notifications = page.locator('button[aria-controls="pulseboard-notifications"]');
	await notifications.evaluate((button: HTMLButtonElement) => button.click());
	await expect(page.getByRole('region', { name: 'Notifications' })).toBeVisible();
	await expect(secondPoint).toBeFocused();
	await expect(secondPoint).toHaveAttribute('tabindex', '0');
	await expect(page.getByRole('status').filter({ hasText: 'Jul 10' })).toContainText(
		'3,342 visitors',
	);
	await notifications.evaluate((button: HTMLButtonElement) => button.click());
	await expect(page.getByRole('region', { name: 'Notifications' })).toHaveCount(0);

	const thirtyDays = page.getByRole('button', { name: '30 days' });
	const sevenDays = page.getByRole('button', { name: '7 days' });
	await thirtyDays.click();
	await sevenDays.click();
	await thirtyDays.click();
	await expect(
		page.getByRole('status').filter({ hasText: 'Loading the 30-day window' }),
	).toBeVisible();
	await expect(thirtyDays).toHaveAttribute('aria-pressed', 'true');
	await expect(page).toHaveURL(/range=30d/);
	chart = page.getByRole('group', { name: 'Visitors trend, last 30 days' });
	await expect(chart.getByRole('button')).toHaveCount(30);
	await expect(page.getByRole('status').filter({ hasText: 'Jul 15' })).toContainText(
		'3,824 visitors',
	);
});

test('browser history cancels a pending range request and keeps the restored report authoritative', async ({
	page,
}) => {
	await openDashboard(page);
	await page.getByRole('link', { name: 'Revenue' }).click();
	await expect(page).toHaveURL(/\/workspaces\/northstar\/revenue\?range=7d$/);

	await page.getByRole('button', { name: '30 days' }).click();
	await expect(
		page.getByRole('status').filter({ hasText: 'Loading the 30-day window' }),
	).toBeVisible();
	await page.goBack();

	await expect(page).toHaveURL(/\/workspaces\/northstar\/overview\?range=7d$/);
	await expect(page.getByRole('heading', { name: 'Growth overview' })).toBeVisible();
	await expect(page.getByRole('button', { name: '7 days' })).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	await expect(page.getByRole('status').filter({ hasText: /Loading the .* window/ })).toHaveCount(
		0,
	);

	// The abandoned request must not mutate the history entry after its delayed work settles.
	await page.evaluate(() => new Promise<void>((resolve) => window.setTimeout(resolve, 350)));
	await expect(page).toHaveURL(/\/workspaces\/northstar\/overview\?range=7d$/);
	await expect(page.getByRole('group', { name: 'Visitors trend, last 7 days' })).toBeVisible();

	await page.goForward();
	await expect(page).toHaveURL(/\/workspaces\/northstar\/revenue\?range=7d$/);
	await page.goBack();
	await expect(page).toHaveURL(/\/workspaces\/northstar\/overview\?range=7d$/);
});

test('sorts, filters, selects, and recovers the accessible campaign report', async ({ page }) => {
	await openDashboard(page);
	const report = page.getByRole('table', { name: 'Deterministic campaign performance report' });
	await expect(report.getByRole('row')).toHaveCount(13);
	const revenueHeader = report.getByRole('columnheader', { name: /Revenue/ });
	const sortRevenue = page.getByRole('button', { name: 'Sort by Revenue' });
	await sortRevenue.click();
	await sortRevenue.click();
	await expect(revenueHeader).toHaveAttribute('aria-sort', 'ascending');
	await expect(report.getByRole('row').nth(1)).toContainText('Legacy display');
	await expect(report.getByRole('row').nth(1)).toContainText('$37,100');

	const search = page.getByRole('searchbox', { name: 'Search campaigns' });
	await search.fill('Display');
	await expect(report.getByRole('row')).toHaveCount(3);
	await expect(page.getByText('2 of 12 campaigns · 0 selected')).toBeVisible();
	await page.getByRole('checkbox', { name: 'Select Legacy display' }).click();
	await expect(page.getByText('2 of 12 campaigns · 1 selected')).toBeVisible();
	await expect(report.getByRole('row', { name: /Legacy display/ })).toHaveClass(
		/campaign-row--selected/,
	);

	await search.fill('no matching campaign');
	await expect(report.getByText('No campaigns match “no matching campaign”')).toBeVisible();
	await page.getByRole('button', { name: 'Clear campaign search' }).click();
	await expect(report.getByRole('row')).toHaveCount(13);
	await expect(page.getByText('12 of 12 campaigns · 1 selected')).toBeVisible();
});

test('windows measured operational logs and jumps to a deterministic off-screen incident', async ({
	page,
}) => {
	await openDashboard(page);
	const log = page.getByRole('list', { name: 'Virtualized operational activity' });
	await expect(log).toBeVisible();
	const initialItems = log.getByRole('listitem');
	await expect(initialItems.first()).toHaveAttribute('data-event-id', 'evt-001');
	const incident = log.locator('[data-event-id="evt-241"]');
	await expect(incident).not.toBeAttached();

	await page.getByRole('button', { name: 'Jump to checkout spike' }).click();
	await expect(incident).toBeVisible();
	await expect(incident).toContainText('Checkout conversion spike isolated');
	await expect(incident).toContainText('Mobile checkout rose 38% above its seeded baseline');
	const incidentBox = await incident.boundingBox();
	const logBox = await log.boundingBox();
	if (!incidentBox || !logBox)
		throw new Error('the incident and virtual viewport must be measured');
	expect(incidentBox.y).toBeGreaterThanOrEqual(logBox.y);
	expect(incidentBox.y + incidentBox.height).toBeLessThanOrEqual(logBox.y + logBox.height + 1);
	expect(await log.evaluate((element) => element.scrollTop)).toBeGreaterThan(10_000);

	await page.getByRole('button', { name: 'Error', exact: true }).click();
	await expect(page.getByRole('status').filter({ hasText: 'error events indexed' })).toBeVisible();
	const filteredItems = log.getByRole('listitem');
	await expect(filteredItems.first().locator('.log-level')).toHaveText('error');
	for (const item of await filteredItems.all()) {
		await expect(item.locator('.log-level')).toHaveText('error');
	}
});

test('retries load and refresh failures without hiding retained data, then restores an empty fixture', async ({
	page,
}) => {
	await page.goto(
		'/workspaces/northstar/overview?range=7d&scenario=load-failure%2Crefresh-failure',
	);
	await expect(
		page.getByRole('heading', { name: 'We couldn’t load this dashboard' }),
	).toBeVisible();
	await page.getByRole('button', { name: 'Retry dashboard load' }).click();
	await expect(page.getByTestId('pulseboard-ready')).toBeVisible();
	await expect(page.getByText('Snapshot revision 1 · 14:32 UTC')).toBeVisible();

	await page.getByRole('button', { name: /Refresh snapshot/ }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Refreshing snapshot' })).toBeVisible();
	await expect(page.getByRole('alert')).toContainText('Snapshot refresh paused');
	await expect(page.getByRole('group', { name: 'Visitors trend, last 7 days' })).toBeVisible();
	await page.getByRole('link', { name: 'Acquisition' }).click();
	await expect(page.getByRole('heading', { name: 'Acquisition health' })).toBeVisible();
	await expect(page.getByRole('alert')).toContainText('existing analytics remain visible');
	await page.getByRole('button', { name: 'Retry snapshot refresh' }).click();
	await expect(page.getByText('Snapshot revision 2 · 14:32 UTC')).toBeVisible();
	await expect(page.getByRole('alert')).toHaveCount(0);

	await page.goto('/workspaces/northstar/overview?range=7d&scenario=empty');
	await expect(page.getByTestId('pulseboard-ready')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'No traffic in this segment' })).toBeVisible();
	await expect(page.getByRole('group', { name: /Visitors trend/ })).toHaveCount(0);
	await page.getByRole('button', { name: 'Restore sample signals' }).click();
	await expect(page.getByRole('heading', { name: 'Growth overview' })).toBeVisible();
	await expect(page.getByRole('group', { name: 'Visitors trend, last 7 days' })).toBeVisible();
});
