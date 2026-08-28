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
	expect(await input.inputValue()).toBe('123456');
	await input.evaluate((element: HTMLInputElement) => {
		element.setSelectionRange(3, 4);
		document.dispatchEvent(new Event('selectionchange'));
	});
	await expect.poll(async () => input.getAttribute('data-input-otp-mss')).toBe('3');
	await expect.poll(async () => input.getAttribute('data-input-otp-mse')).toBe('4');
	await expectSelection(input, [3, 4]);
	await input.press(`${modifier}+Backspace`);
	expect(await input.inputValue()).toBe('12356');
});

it('should forward-delete character when pressing delete', async () => {
	const input = page.getByRole('textbox');
	await input.pressSequentially('123456');
	expect(await input.inputValue()).toBe('123456');
	await expectSelection(input, [5, 6]);
	await input.press('Delete');
	expect(await input.inputValue()).toBe('12345');
	await input.evaluate((element: HTMLInputElement) => {
		element.setSelectionRange(0, 1);
		document.dispatchEvent(new Event('selectionchange'));
	});
	await expectSelection(input, [0, 1]);
	await input.press('Delete');
	expect(await input.inputValue()).toBe('2345');
	await input.evaluate((element: HTMLInputElement) => {
		element.setSelectionRange(2, 3);
		document.dispatchEvent(new Event('selectionchange'));
	});
	await expectSelection(input, [2, 3]);
	await input.press('Delete');
	expect(await input.inputValue()).toBe('235');
});
