import { stringify } from 'devalue';
import type { Browser } from 'playwright';
import { expect } from 'vitest';

/** Exercise the same authored and emitted contract through both production bundlers. */
export async function checkFileSchemaRpc(browser: Browser, origin: string) {
	const page = await browser.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.setDefaultTimeout(7_000);
	try {
		expect((await page.goto(origin + '/file-title'))?.status()).toBe(200);
		const button = page.getByRole('button', { name: 'Open draft' });
		const [reply] = await Promise.all([
			page.waitForResponse((response) => response.url().includes('/_$_ripple_rpc_$_/')),
			button.click(),
		]);
		expect(reply.request().method()).toBe('POST');
		expect(reply.status()).toBe(200);
		await page.getByText('Unpublished draft title', { exact: true }).waitFor();

		// Hold the raw transport fixed: only the argument changes when bypassing the client parser.
		const rawRead = (id: unknown) =>
			page.request.post(reply.url(), {
				headers: { 'Content-Type': 'application/json' },
				data: stringify([id]),
			});
		expect((await rawRead('draft')).status()).toBe(200);
		expect((await rawRead(42)).ok()).toBe(false);

		// Valid RPC encoding, incompatible application payload (a boolean title).
		await page.route(reply.url(), (route) =>
			route.fulfill({
				contentType: 'application/json',
				body: stringify({ value: { title: false } }),
			}),
		);
		await button.click();
		await page.getByText('Invalid file reply', { exact: true }).waitFor();
	} catch (cause) {
		throw new Error(
			`File title page: ${await page.locator('body').innerText()}, page errors: ${errors}`,
			{ cause },
		);
	} finally {
		await page.close();
	}
}
