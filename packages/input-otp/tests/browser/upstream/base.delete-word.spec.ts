import { expect, it } from 'vitest';
import { expectSelection, page, setupBrowser } from '../_browser';

setupBrowser();
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

it('should backspace previous word (even if there is not a selected character)', async () => {
	const input = page.getByRole('textbox');
	await input.pressSequentially('1234');
	await input.press(`${modifier}+Backspace`);
	expect(await input.inputValue()).toBe('');
});

it('should backspace selected char', async () => {
	const input = page.getByRole('textbox');
	await input.pressSequentially('123456');
	await expectSelection(input, [5, 6]);
	await input.press('ArrowLeft');
	await expectSelection(input, [4, 5]);
	await input.press('ArrowLeft');
	await expectSelection(input, [3, 4]);
	await input.press(`${modifier}+Backspace`);
	expect(await input.inputValue()).toBe('12356');
});

it('should forward-delete character when pressing delete', async () => {
	const input = page.getByRole('textbox');
	await input.pressSequentially('123456');
	await expectSelection(input, [5, 6]);
	await input.press('Delete');
	expect(await input.inputValue()).toBe('12345');
	await expectSelection(input, [5, 5]);
	for (const expected of [
		[4, 5],
		[3, 4],
		[2, 3],
		[1, 2],
		[0, 1],
	] as const) {
		await input.press('ArrowLeft');
		await expectSelection(input, expected);
	}
	await input.press('Delete');
	expect(await input.inputValue()).toBe('2345');
	await expectSelection(input, [0, 1]);
	for (const expected of [
		[1, 2],
		[2, 3],
	] as const) {
		await input.press('ArrowRight');
		await expectSelection(input, expected);
	}
	await input.press('Delete');
	expect(await input.inputValue()).toBe('235');
});
