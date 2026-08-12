import { expect, it } from 'vitest';
import { goto, page, setupPristineBrowser } from './_browser';

setupPristineBrowser();
const input = () => page.getByRole('textbox');

it('should backspace previous word (even if there is not a selected character)', async () => {
	await input().pressSequentially('1234');
	await input().press(process.platform === 'darwin' ? 'Meta+Backspace' : 'Control+Backspace');
	expect(await input().inputValue()).toBe('');
});
it('should backspace selected char', async () => {
	await input().fill('123456');
	await input().evaluate((node: HTMLInputElement) => node.setSelectionRange(2, 3));
	await input().press('Backspace');
	expect(await input().inputValue()).toBe('12456');
});
it('should forward-delete character when pressing delete', async () => {
	await input().pressSequentially('123456');
	await expect
		.poll(() =>
			input().evaluate((node: HTMLInputElement) => [node.selectionStart, node.selectionEnd]),
		)
		.toEqual([5, 6]);
	await input().press('Delete');
	expect(await input().inputValue()).toBe('12345');
	await input().evaluate((node: HTMLInputElement) => node.setSelectionRange(0, 1));
	await input().press('Delete');
	expect(await input().inputValue()).toBe('2345');
	await input().evaluate((node: HTMLInputElement) => node.setSelectionRange(2, 3));
	await input().press('Delete');
	expect(await input().inputValue()).toBe('235');
});
it('should receive props accordingly', async () => {
	await goto('/props');
	expect(await page.getByTestId('input-otp-1').isDisabled()).toBe(true);
	expect(await page.getByTestId('input-otp-2').getAttribute('inputmode')).toBe('numeric');
	expect(await page.getByTestId('input-otp-3').getAttribute('inputmode')).toBe('text');
	expect(
		await page
			.locator('[data-input-otp-container]:has([data-testid="input-otp-4"])')
			.getAttribute('class'),
	).toBe('testclassname');
	expect(await page.getByTestId('input-otp-5').getAttribute('maxlength')).toBe('3');
	expect(await page.getByTestId('input-otp-6').getAttribute('id')).toBe('testid');
	expect(await page.getByTestId('input-otp-7').getAttribute('pattern')).toBe(' ');
});
it('should expose focus flags', async () => {
	await input().focus();
	expect(
		await page.getByTestId('input-otp-renderer').getAttribute('data-test-render-is-focused'),
	).toBe('true');
	await input().blur();
	await page.waitForTimeout(100);
	expect(
		await page.getByTestId('input-otp-renderer').getAttribute('data-test-render-is-focused'),
	).toBeNull();
});
it('should expose hover flags', async () => {
	const renderer = page.getByTestId('input-otp-renderer');
	const rect = await renderer.boundingBox();
	expect(rect).not.toBeNull();
	await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
	await expect.poll(() => renderer.getAttribute('data-test-render-is-hovering')).toBe('true');
});
it('should replace selected char if another is pressed', async () => {
	await input().fill('123456');
	await input().evaluate((node: HTMLInputElement) => node.setSelectionRange(2, 3));
	await input().press('9');
	expect(await input().inputValue()).toBe('129456');
});
it('should replace multi-selected chars if another is pressed', async () => {
	await input().fill('123456');
	await input().evaluate((node: HTMLInputElement) => node.setSelectionRange(1, 4));
	await input().press('9');
	expect(await input().inputValue()).toBe('1956');
});
it('should replace last char if another one is pressed', async () => {
	await input().fill('123456');
	await input().press('9');
	expect(await input().inputValue()).toBe('123459');
});
it('should expose the slot value', async () => {
	await input().pressSequentially('12');
	expect(await page.getByTestId('slot-0').getAttribute('data-test-char')).toBe('1');
	expect(await page.getByTestId('slot-1').getAttribute('data-test-char')).toBe('2');
});
it('should start as empty value', async () => {
	expect(await input().inputValue()).toBe('');
});
it('should change the input value', async () => {
	await input().fill('123');
	expect(await input().inputValue()).toBe('123');
});
it('should prevent typing greater than max length', async () => {
	await input().pressSequentially('123456');
	await expect
		.poll(() =>
			input().evaluate((node: HTMLInputElement) => [node.selectionStart, node.selectionEnd]),
		)
		.toEqual([5, 6]);
	await input().press('7');
	expect(await input().inputValue()).toBe('123457');
});
it('should autofocus', async () => {
	await goto('/with-autofocus');
	expect(await input().evaluate((node) => node === document.activeElement)).toBe(true);
});
it('should change the input value', async () => {
	await goto('/with-on-complete');
	await input().pressSequentially('123456');
	expect(await input().inputValue()).toBe('123456');
	await expect.poll(() => input().isDisabled()).toBe(true);
});
