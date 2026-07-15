import { test, expect } from './test.ts';

test('adds a title, persists it through reload, and removes it from the watchlist', async ({
	page,
}) => {
	await page.goto('/title/aurora-rising');
	await expect(page.getByRole('heading', { name: 'Aurora Rising', level: 1 })).toBeVisible();
	await page.getByRole('button', { name: 'Add Aurora Rising to watchlist' }).click();
	await expect(
		page.getByRole('button', { name: 'Remove Aurora Rising from watchlist' }),
	).toBeVisible();

	await page.getByRole('link', { name: /Watchlist/ }).click();
	await expect(page).toHaveURL(/\/watchlist$/);
	await expect(page.getByRole('link', { name: 'Aurora Rising', exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('link', { name: 'Aurora Rising', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Remove Aurora Rising from watchlist' }).click();
	await expect(
		page.getByRole('heading', { name: 'Your watchlist is ready for a first pick' }),
	).toBeVisible();
});
