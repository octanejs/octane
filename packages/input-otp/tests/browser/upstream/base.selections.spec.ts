import { expect, it } from 'vitest';
import { expectSelection, page, setupBrowser } from '../_browser';

setupBrowser();

async function expectMirrorSelection(start: number, end: number): Promise<void> {
	const input = page.getByRole('textbox');
	await expect.poll(async () => input.getAttribute('data-input-otp-mss')).toBe(String(start));
	await expect.poll(async () => input.getAttribute('data-input-otp-mse')).toBe(String(end));
}

async function pressAndExpectSelection(key: string, start: number, end: number): Promise<void> {
	const input = page.getByRole('textbox');
	await input.press(key);
	await input.evaluate(() => document.dispatchEvent(new Event('selectionchange')));
	await expectMirrorSelection(start, end);
	await expectSelection(input, [start, end]);
}

it('should replace selected char if another is pressed', async () => {
	const input = page.getByRole('textbox');
	await input.pressSequentially('123');
	await expectSelection(input, [3, 3]);
	await input.press('ArrowLeft');
	await expectSelection(input, [2, 3]);
	await input.pressSequentially('1');
	expect(await input.inputValue()).toBe('121');
});

it('should replace last char if another one is pressed', async () => {
	const input = page.getByRole('textbox');
	await input.pressSequentially('123456');
	await expectSelection(input, [5, 6]);
	await input.pressSequentially('7');
	expect(await input.inputValue()).toBe('123457');
});

it('should move slot selection with arrow keys when input is full', async () => {
	const input = page.getByRole('textbox');
	await input.pressSequentially('123456');
	expect(await input.inputValue()).toBe('123456');
	await expectMirrorSelection(5, 6);
	await pressAndExpectSelection('ArrowLeft', 4, 5);
	await pressAndExpectSelection('ArrowLeft', 3, 4);
	await pressAndExpectSelection('ArrowRight', 4, 5);
	await pressAndExpectSelection('ArrowRight', 5, 6);
	await pressAndExpectSelection('ArrowRight', 5, 6);
	for (let index = 4; index >= 0; index--) {
		await pressAndExpectSelection('ArrowLeft', index, index + 1);
	}
	await pressAndExpectSelection('ArrowLeft', 0, 1);
});

it('should select previous slot when pressing arrow left in insert mode', async () => {
	const input = page.getByRole('textbox');
	await input.pressSequentially('123');
	expect(await input.inputValue()).toBe('123');
	await expectMirrorSelection(3, 3);
	await pressAndExpectSelection('ArrowLeft', 2, 3);
	await pressAndExpectSelection('ArrowLeft', 1, 2);
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
