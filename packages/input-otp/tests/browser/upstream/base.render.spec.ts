import { expect, it } from 'vitest';
import { page, setupBrowser } from '../_browser';

setupBrowser();

it('should expose focus flags', async () => {
	const input = page.getByRole('textbox');
	const renderer = page.getByTestId('input-otp-renderer');
	await input.focus();
	expect(await renderer.getAttribute('data-test-render-is-focused')).toBe('true');
	await input.blur();
	expect(await renderer.getAttribute('data-test-render-is-focused')).toBeNull();
});

it('should expose hover flags', async () => {
	const renderer = page.getByTestId('input-otp-renderer');
	expect(await renderer.getAttribute('data-test-render-is-hovering')).toBeNull();
	const rect = await renderer.boundingBox();
	expect(rect).not.toBeNull();
	await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
	await expect.poll(() => renderer.getAttribute('data-test-render-is-hovering')).toBe('true');
});
