import { test as base, expect } from '@playwright/test';

// The SAME journeys run against both flavors (see playwright.config.ts
// projects) — identical assertions passing under octane-start AND
// react-start IS the behavioral half of the correctness gate. Every test
// fails on any page error or console error.

const test = base.extend<{ cleanConsole: void }>({
	cleanConsole: [
		async ({ page }, use, testInfo) => {
			const problems: string[] = [];
			page.on('pageerror', (error) => problems.push(`pageerror: ${error}`));
			page.on('console', (message) => {
				// A not-found route correctly serves HTTP 404; Chromium logs the
				// document load itself as a resource error. That is the contract
				// under test, not a defect.
				if (message.type() === 'error' && !/Failed to load resource.*404/.test(message.text())) {
					problems.push(`console.error: ${message.text()}`);
				}
			});
			await use();
			expect
				.soft(problems, `${testInfo.project.name}: browser diagnostics must be clean`)
				.toEqual([]);
		},
		{ auto: true },
	],
});

test.describe('start bench app — behavioral parity', () => {
	test('home renders and hydrates interactively', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'Welcome Home!!!' })).toBeVisible();
		await expect(page.getByTestId('root-nav')).toBeVisible();
		// Hydration proof: client-side navigation works from the shell nav.
		await page.getByTestId('root-nav').getByRole('link', { name: 'Posts' }).click();
		await expect(page.getByTestId('posts-parent-hydration-counter')).toBeVisible();
	});

	test('posts: loader data, params navigation, island of state persists', async ({ page }) => {
		await page.goto('/posts');
		await expect(page.getByTestId('PostsIndexComponent')).toBeVisible();
		// State before navigating — proves the later transition is client-side.
		await page.getByTestId('posts-parent-hydration-counter').click();
		await expect(page.getByTestId('posts-parent-hydration-counter')).toContainText('1');
		await page.getByRole('link', { name: 'Post 3: deterministi' }).click();
		await expect(page.getByRole('heading', { name: /Post 3/ })).toBeVisible();
		await expect(page.getByText('Body of post 3.', { exact: false })).toBeVisible();
		// The parent route did NOT remount across the child navigation.
		await expect(page.getByTestId('posts-parent-hydration-counter')).toContainText('1');
	});

	test('deferred: streamed values resolve and the page stays interactive', async ({ page }) => {
		await page.goto('/deferred');
		await expect(page.getByTestId('regular-person')).toHaveText('John Doe - 4');
		await expect(page.getByTestId('deferred-person')).toHaveText('Tanner Linsley - 17');
		await expect(page.getByTestId('deferred-stuff')).toHaveText('Hello deferred!');
		await page.getByTestId('deferred-increment').click();
		await expect(page.getByTestId('deferred-count')).toHaveText('Count: 1');
	});

	test('unknown post routes to the not-found boundary', async ({ page }) => {
		await page.goto('/posts/i-do-not-exist');
		await expect(page.getByTestId('default-not-found-component')).toBeVisible();
		await expect(page.getByText('Post not found')).toBeVisible();
	});
});
