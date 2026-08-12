import { expect, it } from 'vitest';
import { page, setupBrowser } from '../_browser';

setupBrowser('/with-on-complete');

it('should change the input value', async () => {
	const input = page.getByRole('textbox');
	await input.pressSequentially('123456');
	expect(await input.inputValue()).toBe('123456');
	await expect.poll(() => input.isDisabled()).toBe(true);
});
