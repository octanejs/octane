import { expect, it } from 'vitest';

import { goto, page, setupBrowser } from './_browser';

setupBrowser();

it('transforms pasted content before insertion', async () => {
	await goto('/paste-transform');
	const input = page.getByRole('textbox');
	await input.evaluate((element) => {
		const event = new Event('paste', { bubbles: true, cancelable: true });
		Object.defineProperty(event, 'clipboardData', { value: { getData: () => '12-34-56' } });
		element.dispatchEvent(event);
	});
	expect(await input.inputValue()).toBe('123456');
});

it('detects known and geometry-derived password-manager badges and increases width', async () => {
	const input = page.getByRole('textbox');
	await page.evaluate(() => {
		const badge = document.createElement('div');
		badge.setAttribute('data-lastpass-icon-root', '');
		document.body.appendChild(badge);
	});
	await input.focus();
	await expect
		.poll(() => input.evaluate((element) => element.style.width), { timeout: 7_000 })
		.toContain('+ 40px');

	await goto('/base');
	await page.evaluate(() => {
		document.elementFromPoint = () => document.body;
	});
	const geometryInput = page.getByRole('textbox');
	await geometryInput.focus();
	await expect
		.poll(() => geometryInput.evaluate((element) => element.style.width), { timeout: 7_000 })
		.toContain('+ 40px');
});

it('does not push a badge without viewport space or when strategy is none', async () => {
	await page.locator('[data-input-otp-container]').evaluate((element) => {
		const container = element as HTMLElement;
		container.style.position = 'fixed';
		container.style.right = '0';
		const badge = document.createElement('div');
		badge.setAttribute('data-dashlanecreated', '');
		document.body.appendChild(badge);
	});
	const input = page.getByRole('textbox');
	await input.focus();
	await page.waitForTimeout(1100);
	expect(await input.evaluate((element) => element.style.width)).toBe('100%');

	await goto('/password-manager-none');
	const noPushInput = page.getByRole('textbox');
	await page.evaluate(() => {
		const badge = document.createElement('com-1password-button');
		document.body.appendChild(badge);
	});
	await noPushInput.focus();
	await page.waitForTimeout(50);
	expect(await noPushInput.evaluate((element) => element.style.width)).toBe('100%');
});
