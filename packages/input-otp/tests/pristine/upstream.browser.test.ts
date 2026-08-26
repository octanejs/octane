import { expect, it } from 'vitest';
import { goto, page, setupPristineBrowser } from './_browser';

setupPristineBrowser();
const input = () => page.getByRole('textbox');
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

async function expectMirrorSelection(start: number, end: number): Promise<void> {
	const target = input();
	await expect.poll(async () => target.getAttribute('data-input-otp-mss')).toBe(String(start));
	await expect.poll(async () => target.getAttribute('data-input-otp-mse')).toBe(String(end));
}

async function setSelectionAndWait(start: number, end: number): Promise<void> {
	await input().evaluate(
		(element: HTMLInputElement, range: [number, number]) => {
			element.setSelectionRange(range[0], range[1]);
			document.dispatchEvent(new Event('selectionchange'));
		},
		[start, end] as [number, number],
	);
	await expectMirrorSelection(start, end);
}

async function pressAndExpectSelection(key: string, start: number, end: number): Promise<void> {
	await input().press(key);
	await input().evaluate(() => document.dispatchEvent(new Event('selectionchange')));
	await expectMirrorSelection(start, end);
}

async function settleMirrorSelection(start: number, end: number): Promise<void> {
	await input().evaluate(() => document.dispatchEvent(new Event('selectionchange')));
	await expectMirrorSelection(start, end);
}

async function plantFakeBadge(): Promise<void> {
	await page.evaluate(() => {
		const badge = document.createElement('div');
		badge.setAttribute('data-lastpass-icon-root', '');
		document.body.appendChild(badge);
	});
}

it('should backspace previous word (even if there is not a selected character)', async () => {
	await input().pressSequentially('1234');
	expect(await input().inputValue()).toBe('1234');
	await input().press(`${modifier}+Backspace`);
	expect(await input().inputValue()).toBe('');
});
it('should backspace selected char', async () => {
	await input().pressSequentially('123456');
	expect(await input().inputValue()).toBe('123456');
	await setSelectionAndWait(3, 4);
	await input().press(`${modifier}+Backspace`);
	expect(await input().inputValue()).toBe('12356');
});
it('should forward-delete character when pressing delete', async () => {
	await input().pressSequentially('123456');
	expect(await input().inputValue()).toBe('123456');
	await settleMirrorSelection(5, 6);
	await input().press('Delete');
	expect(await input().inputValue()).toBe('12345');
	await setSelectionAndWait(0, 1);
	await input().press('Delete');
	expect(await input().inputValue()).toBe('2345');
	await setSelectionAndWait(2, 3);
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
	await input().pressSequentially('123');
	await settleMirrorSelection(3, 3);
	await pressAndExpectSelection('ArrowLeft', 2, 3);
	await input().pressSequentially('1');
	expect(await input().inputValue()).toBe('121');
});
it('should replace last char if another one is pressed', async () => {
	await input().pressSequentially('123456');
	await settleMirrorSelection(5, 6);
	await input().pressSequentially('7');
	await page.waitForTimeout(100);
	expect(await input().inputValue()).toBe('123457');
});
it('should move slot selection with arrow keys when input is full', async () => {
	await input().pressSequentially('123456');
	expect(await input().inputValue()).toBe('123456');
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
	await input().pressSequentially('123');
	expect(await input().inputValue()).toBe('123');
	await expectMirrorSelection(3, 3);
	await pressAndExpectSelection('ArrowLeft', 2, 3);
	await pressAndExpectSelection('ArrowLeft', 1, 2);
});
it('should replace multi-selected chars if another is pressed', async () => {
	await input().pressSequentially('123456');
	await page.waitForTimeout(100);
	await input().press('Shift+ArrowLeft');
	await input().press('Shift+ArrowLeft');
	await page.waitForTimeout(100);
	await input().pressSequentially('1');
	expect(await input().inputValue()).toBe('1231');
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
	await input().pressSequentially('1');
	expect(await input().inputValue()).toBe('1');
	await input().pressSequentially('23456');
	expect(await input().inputValue()).toBe('123456');
});
it('should prevent typing greater than max length', async () => {
	await input().pressSequentially('123456');
	expect(await input().inputValue()).toBe('123456');
	await settleMirrorSelection(5, 6);
	await input().pressSequentially('7');
	expect(await input().inputValue()).toBe('123457');
});
it('pushes the badge when the gutter fits', async () => {
	await goto('/pwm-space');
	await plantFakeBadge();
	const roomy = page.getByTestId('roomy').getByRole('textbox');
	await roomy.focus();
	expect(await roomy.evaluate((element) => document.activeElement === element)).toBe(true);
	await expect
		.poll(async () => roomy.evaluate((element) => element.style.width))
		.toBe('calc(100% + 40px)');
	await expect
		.poll(async () => roomy.evaluate((element) => element.style.clipPath))
		.toBe('inset(0px 40px 0px 0px)');
});
it('does not push inside a constrained scroll container', async () => {
	await goto('/pwm-space');
	await plantFakeBadge();
	const card = page.getByTestId('tight');
	const tight = card.getByRole('textbox');
	await tight.focus();
	expect(await tight.evaluate((element) => document.activeElement === element)).toBe(true);
	await page.waitForTimeout(2_500);
	expect(await tight.evaluate((element) => element.style.width)).toBe('100%');
	expect(await card.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false);
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
