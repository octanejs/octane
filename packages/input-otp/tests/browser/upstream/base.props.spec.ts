import { expect, it } from 'vitest';
import { page, setupBrowser } from '../_browser';

setupBrowser('/props');

it('should receive props accordingly', async () => {
	expect(await page.getByTestId('input-otp-1').isDisabled()).toBe(true);
	expect(await page.getByTestId('input-otp-2').getAttribute('inputmode')).toBe('numeric');
	expect(await page.getByTestId('input-otp-3').getAttribute('inputmode')).toBe('text');
	expect(
		await page
			.locator('[data-input-otp-container]:has([data-testid="input-otp-4"])')
			.getAttribute('class'),
	).toBe('testclassname');
	expect(await page.getByTestId('input-otp-5').getAttribute('maxlength')).toBe('3');
	expect(await page.getByTestId('input-otp-6').getAttribute('id')).toBe('testid');
	expect(await page.getByTestId('input-otp-6').getAttribute('name')).toBe('testname');
	expect(await page.getByTestId('input-otp-7').getAttribute('pattern')).toBe(' ');
});
