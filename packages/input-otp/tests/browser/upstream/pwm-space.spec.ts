import { expect, it } from 'vitest';

import { goto, page, setupBrowser } from '../_browser';

setupBrowser('/pwm-space');

const SECOND_PROBE_DELAY = 2_500;

async function plantFakeBadge(): Promise<void> {
	await page.evaluate(() => {
		const badge = document.createElement('div');
		badge.setAttribute('data-lastpass-icon-root', '');
		document.body.appendChild(badge);
	});
}

it('pushes the badge when the gutter fits', async () => {
	await plantFakeBadge();
	const input = page.getByTestId('roomy').getByRole('textbox');
	await input.focus();
	expect(await input.evaluate((element) => document.activeElement === element)).toBe(true);
	await expect
		.poll(async () => input.evaluate((element) => element.style.width))
		.toBe('calc(100% + 40px)');
	await expect
		.poll(async () => input.evaluate((element) => element.style.clipPath))
		.toBe('inset(0px 40px 0px 0px)');
});

it('does not push inside a constrained scroll container', async () => {
	await plantFakeBadge();
	const card = page.getByTestId('tight');
	const input = card.getByRole('textbox');
	await input.focus();
	expect(await input.evaluate((element) => document.activeElement === element)).toBe(true);
	await page.waitForTimeout(SECOND_PROBE_DELAY);
	expect(await input.evaluate((element) => element.style.width)).toBe('100%');
	expect(await card.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false);
});
