import { expect, it } from 'vitest';
import { page, setupBrowser } from '../_browser';

setupBrowser();

it('should replace selected char if another is pressed', async () => {
	const input = page.getByRole('textbox');
	await input.pressSequentially('123');
	await input.press('ArrowLeft');
	await expect
		.poll(() => input.evaluate((node) => [node.selectionStart, node.selectionEnd]))
		.toEqual([2, 3]);
	await input.pressSequentially('1');
	expect(await input.inputValue()).toBe('121');
});

it('should replace multi-selected chars if another is pressed', async () => {
	const input = page.getByRole('textbox');
	await input.pressSequentially('123456');
	await input.press('Shift+ArrowLeft');
	await input.press('Shift+ArrowLeft');
	await input.pressSequentially('1');
	expect(await input.inputValue()).toBe('1231');
});

it('should replace last char if another one is pressed', async () => {
	const input = page.getByRole('textbox');
	await input.pressSequentially('1234567');
	expect(await input.inputValue()).toBe('123457');
});
