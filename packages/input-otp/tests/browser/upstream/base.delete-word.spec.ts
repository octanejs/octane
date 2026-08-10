import { expect, it } from 'vitest';
import { page, setupBrowser } from '../_browser';

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
	await input.press('ArrowLeft');
	await expect
		.poll(() => input.evaluate((node) => [node.selectionStart, node.selectionEnd]))
		.toEqual([4, 5]);
	await input.press('ArrowLeft');
	await expect
		.poll(() => input.evaluate((node) => [node.selectionStart, node.selectionEnd]))
		.toEqual([3, 4]);
	await input.press(`${modifier}+Backspace`);
	expect(await input.inputValue()).toBe('12356');
});

it('should forward-delete character when pressing delete', async () => {
	const input = page.getByRole('textbox');
	await input.pressSequentially('123456');
	await input.press('Delete');
	expect(await input.inputValue()).toBe('12345');
	for (const expected of [
		[4, 5],
		[3, 4],
		[2, 3],
		[1, 2],
		[0, 1],
	]) {
		await input.press('ArrowLeft');
		await expect
			.poll(() => input.evaluate((node) => [node.selectionStart, node.selectionEnd]))
			.toEqual(expected);
	}
	await input.press('Delete');
	expect(await input.inputValue()).toBe('2345');
	for (const expected of [
		[1, 2],
		[2, 3],
	]) {
		await input.press('ArrowRight');
		await expect
			.poll(() => input.evaluate((node) => [node.selectionStart, node.selectionEnd]))
			.toEqual(expected);
	}
	await input.press('Delete');
	expect(await input.inputValue()).toBe('235');
});
