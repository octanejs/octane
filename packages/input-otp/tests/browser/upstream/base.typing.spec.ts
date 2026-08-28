import { expect, it } from 'vitest';
import { expectSelection, page, setupBrowser } from '../_browser';

setupBrowser();

it('should start as empty value', async () => {
	expect(await page.getByRole('textbox').inputValue()).toBe('');
});

it('should change the input value', async () => {
	const input = page.getByRole('textbox');
	await input.pressSequentially('1');
	expect(await input.inputValue()).toBe('1');
	await input.pressSequentially('23456');
	expect(await input.inputValue()).toBe('123456');
});

it('should prevent typing greater than max length', async () => {
	const input = page.getByRole('textbox');
	await input.pressSequentially('123456');
	expect(await input.inputValue()).toBe('123456');
	await expectSelection(input, [5, 6]);
	await input.pressSequentially('7');
	expect(await input.inputValue()).toBe('123457');
});
