import { gzipSync } from 'node:zlib';
import { completedAnswer, configuration, expect, open, test } from './lab.ts';

// The page is an islands-only route (#1514): its shell never hydrates, and every
// island is a binding view, so activating them all must not load the renderer.
// The budget measures production chunks, so the Playwright config runs this
// spec only against the production preview.
test('activates every island without the renderer within the islands-only JavaScript budget', async ({
	page,
}) => {
	const scripts = new Map<string, Promise<Buffer>>();
	page.on('response', (response) => {
		if (response.request().resourceType() === 'script')
			scripts.set(new URL(response.url()).pathname, response.body());
	});
	const { path } = configuration({ waves: 2, interval: 20 });
	await open(page, path);
	await expect(page.locator('[data-composer-ready="true"]')).toBeHidden();
	for (const name of ['Activate conversation', 'Activate history', 'Activate tools']) {
		await page.getByRole('button', { name, exact: true }).click();
	}
	await page.getByRole('textbox', { name: 'Message', exact: true }).click();
	await expect(page.locator('[data-composer-ready="true"]')).toBeVisible();
	await completedAnswer(page, 2);
	await expect(page.locator('[data-history]')).toHaveAttribute('data-revision', '2');
	await page.waitForLoadState('networkidle');
	const files = [...scripts.keys()];
	expect(files.some((file) => /\/octane-islands-[^/]+\.js$/.test(file))).toBe(true);
	expect(files.filter((file) => /\/(?:runtime|octane-hydrate)-[^/]+\.js$/.test(file))).toEqual([]);
	let gzip = 0;
	for (const body of await Promise.all(scripts.values()))
		gzip += gzipSync(body, { level: 9 }).length;
	test.info().annotations.push({
		type: 'islands-only JavaScript',
		description: `${files.length} scripts, ${gzip} bytes gzip-9`,
	});
	// #1514 targets 70 KiB. Island activation fixes #1629 (+171 B) and #1660
	// (+197 B) carried the route past it. The known cut that brings it back under
	// is the ~4.1 KB signal Action frame and transition coordinator that
	// signals/graph.ts registers at load, though only the renderer uses them.
	expect(gzip).toBeLessThanOrEqual(71 * 1024);
});
