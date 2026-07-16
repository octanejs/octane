import { expect, test, type Page } from '@playwright/test';
import {
	collectBrowserDiagnostics,
	settleBrowserFrames,
	type BrowserDiagnostics,
} from '../../_shared/e2e/browser.ts';

const diagnosticsByPage = new WeakMap<Page, BrowserDiagnostics>();

test.beforeEach(async ({ page }) => {
	diagnosticsByPage.set(
		page,
		collectBrowserDiagnostics(page, {
			failOnHydrationWarnings: true,
		}),
	);
});

test.afterEach(async ({ page }, testInfo) => {
	const diagnostics = diagnosticsByPage.get(page);
	if (diagnostics === undefined) return;
	try {
		await settleBrowserFrames(page);
		diagnostics.assertClean(testInfo.title);
	} finally {
		diagnostics.stop();
	}
});

test('streams the real trip shell, reveals later weather before earlier fares, and completes the paired plan', async ({
	page,
	baseURL,
}) => {
	if (baseURL === undefined) throw new Error('Wayfinder requires a Playwright baseURL');
	const response = await fetch(new URL('/trips/lisbon?month=oct', baseURL));
	expect(response.status).toBe(200);
	expect(response.body).not.toBeNull();
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	const shellMarkers = [
		'data-trip-id="lisbon"',
		'Pairing the route and stays for Lisbon…',
		'Comparing flexible fares…',
		'Checking the local weather…',
	];
	const revealMarkers = [
		'Bright with a soft Atlantic breeze.',
		'Route + stays ready together',
		'A sensible window from',
	];
	let html = '';
	let responseDone = false;
	let decoderFlushed = false;
	const hasEveryMarker = (markers: string[]): boolean =>
		markers.every((marker) => html.includes(marker));
	const readMore = async (): Promise<void> => {
		const { done, value } = await reader.read();
		responseDone = done;
		if (value !== undefined) html += decoder.decode(value, { stream: !done });
		if (done && !decoderFlushed) {
			html += decoder.decode();
			decoderFlushed = true;
		}
	};

	while (!responseDone && !hasEveryMarker(shellMarkers)) await readMore();
	for (const marker of shellMarkers) expect(html).toContain(marker);
	// The deterministic insight delays leave the HTTP response open after the complete shell arrives.
	expect(responseDone).toBe(false);

	while (!responseDone && !hasEveryMarker(revealMarkers)) await readMore();
	for (const marker of revealMarkers) expect(html).toContain(marker);
	while (!responseDone) await readMore();

	const positionOf = (marker: string): number => {
		const position = html.indexOf(marker);
		expect(position, `streamed HTML should include “${marker}”`).toBeGreaterThan(-1);
		return position;
	};
	const completeShell = Math.max(
		...shellMarkers.map((marker) => positionOf(marker) + marker.length),
	);
	const weatherReveal = positionOf('Bright with a soft Atlantic breeze.');
	const pairedReveal = positionOf('Route + stays ready together');
	const fareReveal = positionOf('A sensible window from');
	const firstReveal = Math.min(weatherReveal, pairedReveal, fareReveal);
	expect(firstReveal).toBeGreaterThan(completeShell);
	expect(pairedReveal).toBeGreaterThan(weatherReveal);
	expect(fareReveal).toBeGreaterThan(pairedReveal);

	await page.goto('/trips/lisbon?month=oct');
	await expect(page.locator('[data-parallel-plan="ready"]')).toContainText(
		'Route + stays ready together',
	);
	await expect(page.locator('[data-stay-id]')).toHaveCount(2);
	await expect(page.getByText('Olive House')).toBeVisible();
	await expect(page.getByText('Linha Rooms')).toBeVisible();
});

test('adopts the deep-linked server trip under CSP and preserves a note typed before hydration', async ({
	page,
}) => {
	await page.addInitScript(() => {
		const scope = window as Window & {
			wayfinderServerTitle?: Element;
			wayfinderCspViolations?: string[];
		};
		scope.wayfinderCspViolations = [];
		window.addEventListener('securitypolicyviolation', (event) => {
			scope.wayfinderCspViolations?.push(`${event.violatedDirective}:${event.blockedURI}`);
		});
		const observer = new MutationObserver(() => {
			const title = document.querySelector('[data-itinerary-title="true"]');
			if (title && scope.wayfinderServerTitle === undefined) scope.wayfinderServerTitle = title;
		});
		observer.observe(document, { childList: true, subtree: true });
	});

	const response = await page.goto('/trips/lisbon?month=oct&hydrateDelay=650', {
		waitUntil: 'domcontentloaded',
	});
	expect(response).not.toBeNull();
	const policy = response!.headers()['content-security-policy'];
	const scriptPolicy = policy.match(/(?:^|; )script-src ([^;]+)/)?.[1];
	expect(scriptPolicy).toMatch(/^'self' 'nonce-([A-Za-z0-9_-]{32})'$/);
	expect(scriptPolicy).not.toContain("'unsafe-inline'");
	const comparisonResponse = await page.request.get('/trips/lisbon?month=oct');
	const comparisonPolicy = comparisonResponse.headers()['content-security-policy'];
	const comparisonScriptPolicy = comparisonPolicy.match(/(?:^|; )script-src ([^;]+)/)?.[1];
	expect(comparisonScriptPolicy).toMatch(/^'self' 'nonce-([A-Za-z0-9_-]{32})'$/);
	expect(comparisonScriptPolicy).not.toBe(scriptPolicy);
	await expect(page.locator('[data-hydrated="false"]')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Lisbon', level: 1 })).toBeVisible();
	const note = page.getByRole('textbox', { name: 'Trip note' });
	await note.fill('Book the tiny tile museum before lunch.');

	await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
	expect(
		await page
			.locator('[data-itinerary-title="true"]')
			.evaluate(
				(element) =>
					(window as Window & { wayfinderServerTitle?: Element }).wayfinderServerTitle === element,
			),
	).toBe(true);
	await expect(note).toHaveValue('Book the tiny tile museum before lunch.');
	await page.getByRole('button', { name: 'Save trip note' }).click();
	await expect(page.getByRole('status').getByText('Note saved on this device.')).toBeVisible();
	expect(
		await page.evaluate(
			() => (window as Window & { wayfinderCspViolations?: string[] }).wayfinderCspViolations,
		),
	).toEqual([]);

	await page.reload();
	await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
	await expect(note).toHaveValue('Book the tiny tile museum before lunch.');
});

test('plans and saves a city with the keyboard, then restores it from the deep-linked shelf', async ({
	page,
}) => {
	await page.goto('/');
	const search = page.getByRole('searchbox', { name: 'Search destinations' });
	await search.fill('Kyoto');
	const tripLink = page.getByRole('link', { name: 'Plan a trip to Kyoto' });
	await expect(tripLink).toBeVisible();
	await search.focus();
	await page.keyboard.press('Tab');
	await expect(tripLink).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/trips\/kyoto\?month=oct$/);
	await expect(page.getByRole('heading', { name: 'Kyoto', level: 1 })).toBeVisible();
	await expect(page.getByText('Route + stays ready together')).toBeVisible();

	const month = page.getByRole('combobox', { name: 'Travel month' });
	await month.focus();
	await page.keyboard.press('a');
	await expect(page).toHaveURL(/month=apr$/);
	await expect(page.getByText('18–22 April', { exact: true })).toBeVisible();
	const save = page.getByRole('button', { name: 'Save this journey' });
	await save.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('button', { name: 'Saved to your journeys' })).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	await page.getByRole('link', { name: /Saved, 1 saved trip/ }).click();
	await expect(page).toHaveURL('/saved');
	await expect(page.getByRole('link', { name: 'Plan a trip to Kyoto' })).toBeVisible();
	await page.reload();
	await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Plan a trip to Kyoto' })).toBeVisible();
});

test('aborts a superseded search and keeps a rapid destination switch on the latest trip', async ({
	page,
}) => {
	await page.goto('/');
	const search = page.getByRole('searchbox', { name: 'Search destinations' });
	await search.fill('lo');
	await expect(page.getByRole('status').getByText('Looking for lo…')).toBeVisible();
	await search.fill('ky');
	await expect(
		page.getByRole('status').getByText('An older search was cancelled; only the latest request'),
	).toBeVisible();
	await expect(page.locator('[data-destination-id="kyoto"]')).toBeVisible();
	await expect(page.locator('[data-destination-id="lisbon"]')).toHaveCount(0);
	await page.waitForTimeout(430);
	await expect(page.locator('[data-destination-id="kyoto"]')).toBeVisible();
	await expect(page.locator('[data-destination-id="lisbon"]')).toHaveCount(0);

	await page.getByRole('link', { name: 'Plan a trip to Kyoto' }).click();
	const note = page.getByRole('textbox', { name: 'Trip note' });
	await note.fill('Return to the quiet garden after the morning market.');
	await page.getByRole('button', { name: 'Save trip note' }).click();
	await expect(page.getByRole('status').getByText('Note saved on this device.')).toBeVisible();

	await page.getByRole('link', { name: 'Lisbon', exact: true }).click();
	await expect(page).toHaveURL(/\/trips\/lisbon/);
	await expect(note).toHaveValue('');
	await note.fill('Take the yellow tram before breakfast.');
	await page.getByRole('button', { name: 'Save trip note' }).click();
	await expect(page.getByRole('status').getByText('Note saved on this device.')).toBeVisible();
	await page.getByRole('link', { name: 'Kyoto', exact: true }).click();
	await expect(page).toHaveURL(/\/trips\/kyoto/);
	await expect(page.getByRole('heading', { name: 'Kyoto', level: 1 })).toBeVisible();
	await expect(note).toHaveValue('Return to the quiet garden after the morning market.');
	await expect(page.locator('.note-status')).toHaveText('');
	await expect(page.getByText('Kawa Machiya')).toBeVisible();
	await page.waitForTimeout(380);
	await expect(page.locator('main[data-trip-id="kyoto"]')).toBeVisible();
	await expect(page.locator('main[data-trip-id="lisbon"]')).toHaveCount(0);
});

test('recovers search and forecast failures, clears an empty result, and remains usable on mobile', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');
	const search = page.getByRole('searchbox', { name: 'Search destinations' });
	await search.fill('outage');
	await expect(page.getByRole('alert')).toContainText('The destination desk did not answer.');
	await page.getByRole('button', { name: 'Retry destination search' }).click();
	await expect(page.locator('[data-destination-id="copenhagen"]')).toBeVisible();
	await search.fill('zzzz');
	await expect(
		page.getByRole('heading', { name: 'That feeling is not in this season’s edition.' }),
	).toBeVisible();
	await page.getByRole('button', { name: 'Show every city' }).click();
	await expect(page.locator('[data-destination-id]')).toHaveCount(4);

	await page.goto('/trips/kyoto?month=oct&scenario=weather-failure');
	await expect(page.getByRole('alert')).toContainText('The local weather desk did not answer.');
	await page.getByRole('button', { name: 'Retry local forecast' }).click();
	await expect(
		page.getByRole('heading', { name: 'Clear mornings, cool after dusk.' }),
	).toBeVisible();
	await expect(page.locator('[data-stream-region="weather"]')).toContainText('19° / 11°');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true,
	);
});
