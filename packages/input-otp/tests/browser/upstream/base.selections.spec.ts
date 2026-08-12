import { expect, it } from 'vitest';
import { expectSelection, page, setupBrowser } from '../_browser';

setupBrowser();

it('should replace selected char if another is pressed', async () => {
	const input = page.getByRole('textbox');
	await input.pressSequentially('123');
	await expectSelection(input, [3, 3]);
	await input.press('ArrowLeft');
	await expectSelection(input, [2, 3]);
	await input.pressSequentially('1');
	expect(await input.inputValue()).toBe('121');
});

it('should replace multi-selected chars if another is pressed', async () => {
	const input = page.getByRole('textbox');
	await input.pressSequentially('123456');
	await expectSelection(input, [5, 6]);
	await input.press('Shift+ArrowLeft');
	await expectSelection(input, [4, 6]);
	await input.press('Shift+ArrowLeft');
	await expectSelection(input, [3, 6]);
	await input.pressSequentially('1');
	expect(await input.inputValue()).toBe('1231');
});

it('should replace last char if another one is pressed', async () => {
	const input = page.getByRole('textbox');
	await input.pressSequentially('1234567');
	expect(await input.inputValue()).toBe('123457');
});
