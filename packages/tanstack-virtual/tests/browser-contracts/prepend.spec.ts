import { expect, test } from '@playwright/test';

for (const mode of ['position', 'transform']) {
	test(`direct DOM ${mode} grows the scroll extent before restoring the end anchor`, async ({
		page,
	}) => {
		await page.goto(`/prepend/?mode=${mode}`);
		const scroller = page.locator('#scroll-container');
		const last = page.locator('[data-row="29"]');
		await expect(last).toBeVisible();
		await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(1300);
		const survivor = await last.elementHandle();
		await page.click('#prepend');
		await expect.poll(() => scroller.evaluate((el) => el.scrollHeight)).toBe(1750);
		await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(1550);
		await expect(last).toBeVisible();
		expect(await survivor!.evaluate((el) => el === document.querySelector('[data-row="29"]'))).toBe(
			true,
		);
		await survivor!.dispose();
	});
}
