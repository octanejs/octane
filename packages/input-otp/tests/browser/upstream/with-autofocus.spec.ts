import { expect, it } from 'vitest';
import { page, setupBrowser } from '../_browser';

setupBrowser('/with-autofocus');

it('should autofocus', async () => {
	expect(
		await page.getByRole('textbox').evaluate((element) => element === document.activeElement),
	).toBe(true);
});
