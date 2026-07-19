import { test, expect } from './test.ts';

// The four Harbor journeys — each one pins a distinct React↔Octane boundary
// behavior end to end, with the hydration/console diagnostics gate ON.

test.describe('harbor — React 19 shell hosting Octane islands', () => {
	test('pre-hydration-input-preservation: server DOM accepts input and is adopted, not replaced', async ({
		page,
	}) => {
		await page.goto('/?hydrateDelay=800', { waitUntil: 'domcontentloaded' });

		// Streaming SSR delivered the full page before any hydration ran.
		await expect(page.locator('.page')).toHaveAttribute('data-app-hydrated', 'false');
		await expect(page.locator('.price-badge-amount')).toHaveText('$48');
		await expect(page.locator('.pick-title')).toHaveText([
			'Single sign-on',
			'Audit log',
			'Priority support',
		]);

		// Interact with the ISLAND's input before hydrateRoot has run, and tag
		// the DOM node so adoption (vs replacement) is provable.
		await page.evaluate(() => {
			const input = document.querySelector('.seats-input') as HTMLInputElement & {
				__preHydration?: string;
			};
			input.__preHydration = 'server-node';
		});
		await page.fill('.seats-input', '7');

		await page.waitForSelector('[data-app-hydrated="true"]');

		// The typed value survived hydration on the SAME node — the island
		// adopted the server DOM instead of remounting over it.
		await expect(page.locator('.seats-input')).toHaveValue('7');
		expect(
			await page.evaluate(
				() =>
					(document.querySelector('.seats-input') as HTMLInputElement & { __preHydration?: string })
						.__preHydration,
			),
		).toBe('server-node');

		// And the hydrated island is live: the pre-typed seats flow into React.
		await page.click('.add-to-compare');
		await expect(page.locator('.compare-count')).toHaveText('1');
		await expect(page.locator('.compare-entry')).toHaveText('fleet · 7 seats');
	});

	test('island-react-round-trip: native island events drive state React consumes', async ({
		page,
	}) => {
		await page.goto('/');
		await page.waitForSelector('[data-app-hydrated="true"]');

		// Island-native interactions: steppers and per-keystroke input.
		await page.click('.seats-step[data-step="up"]');
		await page.click('.seats-step[data-step="up"]');
		await expect(page.locator('.configurator-total-amount')).toHaveText('$240');
		await page.fill('.seats-input', '4');
		await expect(page.locator('.configurator-total-amount')).toHaveText('$192');

		// The island hands its state to the React shell through the callback prop.
		await page.click('.add-to-compare');
		await expect(page.locator('.compare-count')).toHaveText('1');
		await expect(page.locator('.compare-entry')).toHaveText('fleet · 4 seats');

		// Island state persisted across the React re-render — no remount.
		await page.fill('.seats-input', '5');
		await page.click('.add-to-compare');
		await expect(page.locator('.compare-count')).toHaveText('2');
		await expect(page.locator('.compare-entry').nth(1)).toHaveText('fleet · 5 seats');
	});

	test('provider-flip-context: React provider changes re-render islands live', async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('[data-app-hydrated="true"]');

		await expect(page.locator('.price-badge-amount')).toHaveText('$48');
		await expect(page.locator('.price-badge')).toHaveAttribute('data-theme', 'light');

		// Locale flip: the ISLAND and a React-rendered label move together off
		// the same context object.
		await page.click('.toggle-locale');
		await expect(page.locator('.price-badge-amount')).toHaveText('48 €');
		await expect(page.locator('.active-locale')).toHaveAttribute('data-locale', 'de-DE');

		// Theme flip reaches the island's data-theme attribute.
		await page.click('.toggle-theme');
		await expect(page.locator('.price-badge')).toHaveAttribute('data-theme', 'dark');

		// A live subscription, not a one-shot read.
		await page.click('.toggle-locale');
		await expect(page.locator('.price-badge-amount')).toHaveText('$48');
	});

	test('island-fault-boundary-retry: a client island fault reaches the React boundary and recovers', async ({
		page,
	}) => {
		await page.goto('/?fault=recs');
		await page.waitForSelector('[data-app-hydrated="true"]');

		// SSR content is intact — the deterministic outage only affects the
		// FIRST post-hydration refresh.
		await expect(page.locator('.pick-title')).toHaveText([
			'Single sign-on',
			'Audit log',
			'Priority support',
		]);

		// The refresh rejection escapes the island (local @pending, no @catch)
		// into the React class boundary.
		await page.click('.refresh-picks');
		await expect(page.locator('[role="alert"]')).toBeVisible();
		await expect(page.locator('.island-fallback-message')).toContainText('recommendations outage');

		// Fault isolation: the sibling island still re-renders off React context.
		await page.click('.toggle-locale');
		await expect(page.locator('.price-badge-amount')).toHaveText('48 €');

		// "Try again" remounts a clean island (key bump + reseeded cache).
		await page.click('.island-retry');
		await expect(page.locator('.pick-title')).toHaveText([
			'Single sign-on',
			'Audit log',
			'Priority support',
		]);

		// The fault was consumed: the next refresh shows the island-owned
		// pending arm, then the refreshed picks.
		await page.click('.refresh-picks');
		await expect(page.locator('.picks-pending')).toBeVisible();
		await expect(page.locator('.pick-title')).toHaveText([
			'Sandbox environments',
			'Usage insights',
			'Managed backups',
		]);
	});
});
