import { test, expect } from './test.ts';
import type { Response } from '@playwright/test';

function isCatalogSearchResponse(response: Response, search: string): boolean {
	if (new URL(response.url()).pathname !== '/graphql') return false;
	const body = response.request().postDataJSON() as {
		operationName?: unknown;
		variables?: { search?: unknown };
	};
	return body.operationName === 'Catalog' && body.variables?.search === search;
}

test('browses the catalog, filters it, and opens a deep-linked title with the keyboard', async ({
	page,
}) => {
	await page.goto('/');
	await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Find your next great story.' })).toBeVisible();
	await expect(page.locator('[data-title-id]')).toHaveCount(6);

	await page.keyboard.press('Tab');
	await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.locator('main')).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('searchbox', { name: 'Search titles' })).toBeFocused();
	for (let index = 0; index < 4; index++) await page.keyboard.press('Tab');
	const mystery = page.getByRole('button', { name: 'Mystery' });
	await expect(mystery).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/genre=Mystery/);
	await expect(page.locator('[data-title-id]')).toHaveCount(1);
	await expect(mystery).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('button', { name: 'Comedy' })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('link', { name: 'View Paper Moons' })).toBeFocused();
	await page.keyboard.press('Enter');

	await expect(page).toHaveURL(/\/title\/paper-moons$/);
	await expect(page.getByRole('heading', { name: 'Paper Moons', level: 1 })).toBeVisible();
	await expect(page.getByText('Every lie casts a shadow.')).toBeVisible();
});

test('keeps the newest result when slow and fast searches overlap', async ({ page }) => {
	await page.goto('/');
	const search = page.getByRole('searchbox', { name: 'Search titles' });
	const moonResponsePromise = page.waitForResponse((response) =>
		isCatalogSearchResponse(response, 'moon'),
	);
	const harborResponsePromise = page.waitForResponse((response) =>
		isCatalogSearchResponse(response, 'harbor'),
	);
	await search.fill('moon');
	await expect(page.getByText('Searching the catalog…')).toBeVisible();
	await search.fill('harbor');

	const firstResponse = await Promise.race([
		moonResponsePromise.then((response) => ({ search: 'moon', response })),
		harborResponsePromise.then((response) => ({ search: 'harbor', response })),
	]);
	expect(firstResponse.search).toBe('harbor');
	expect(firstResponse.response.status()).toBe(200);
	const harborResponse = await harborResponsePromise;
	expect(harborResponse.status()).toBe(200);
	await expect(page).toHaveURL(/q=harbor/);
	await expect(page.getByRole('link', { name: 'Harbor Lights', exact: true })).toBeVisible();
	const moonResponse = await moonResponsePromise;
	expect(moonResponse.status()).toBe(200);
	await expect(page.getByRole('link', { name: 'Paper Moons', exact: true })).toHaveCount(0);
	await expect(search).toHaveValue('harbor');
});

test('shows empty, offline, and failed states and recovers the failed request', async ({
	page,
	context,
}) => {
	await page.goto('/');
	const search = page.getByRole('searchbox', { name: 'Search titles' });

	await search.fill('nothing-like-this');
	await expect(page.getByRole('heading', { name: 'No titles found' })).toBeVisible();
	await page.getByRole('button', { name: 'Clear search' }).click();
	await expect(page.locator('[data-title-id]')).toHaveCount(6);

	await context.setOffline(true);
	await expect(page.getByText('You’re offline. Saved titles are still available.')).toBeVisible();
	await context.setOffline(false);
	await expect(page.getByText('You’re offline. Saved titles are still available.')).toBeHidden();

	await search.fill('outage');
	await expect(
		page.getByRole('heading', { name: 'The catalog is temporarily unavailable' }),
	).toBeVisible();
	await page.getByRole('button', { name: 'Retry search' }).click();
	await expect(page.getByRole('link', { name: 'Signal Lost', exact: true })).toBeVisible();
});
