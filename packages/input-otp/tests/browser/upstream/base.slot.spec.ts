import { expect, it } from 'vitest';
import { page, setupBrowser } from '../_browser';

setupBrowser();

it('should expose the slot value', async () => {
	const input = page.getByRole('textbox');
	await input.pressSequentially('1');
	expect(await page.getByTestId('slot-0').getAttribute('data-test-char')).toBe('1');
	expect(await page.getByTestId('slot-1').getAttribute('data-test-char')).toBeNull();
	await input.pressSequentially('23456');
	for (let index = 0; index < 6; index++)
		expect(await page.getByTestId(`slot-${index}`).getAttribute('data-test-char')).toBe(
			String(index + 1),
		);
});
