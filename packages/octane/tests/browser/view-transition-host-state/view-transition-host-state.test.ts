import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { closeHostStateServer, openStagePage } from './harness.js';

let browser: Browser;
beforeAll(async () => {
	browser = await launchBrowser({ headless: true });
});
afterAll(async () => {
	await browser?.close();
	await closeHostStateServer();
});

it('preserves external form ownership, committed radios and raw HTML until its real renderer update', async () => {
	const page = await openStagePage(browser, process.env.OCTANE_VT_BROWSER_PACKAGE);
	try {
		await page.evaluate(() =>
			window.octaneHostState.mount('radio', { rows: ['a', 'b', 'c'], choice: 'a' }),
		);
		const form = await page.locator('form').elementHandle();
		const survivor = await page.locator('[data-row="b"]').elementHandle();
		const before = await page.locator('[data-raw] > b').elementHandle();
		await page.evaluate(() =>
			window.octaneHostState.update({ rows: ['d', 'b', 'c'], choice: 'external' }),
		);
		await page.waitForFunction(() => window.octaneHostState.prepared);
		expect(await before!.evaluate((node) => node.isConnected)).toBe(true);
		expect(await page.locator('input:checked').getAttribute('value')).toBe('a');
		expect(await page.locator('section').getAttribute('class')).toBe('before');
		expect(
			await form!.evaluate((node) =>
				[...(node as HTMLFormElement).elements].map((item) => (item as HTMLInputElement).value),
			),
		).toEqual(['a', 'b', 'c', 'external']);
		await page.evaluate(() => window.octaneHostState.publish());
		expect(await before!.evaluate((node) => node.isConnected)).toBe(false);
		expect(
			await survivor!.evaluate((node) => node === document.querySelector('[data-row="b"]')),
		).toBe(true);
		expect(
			await form!.evaluate((node) => {
				const external = document.querySelector<HTMLInputElement>('[data-external]')!;
				return {
					owner: external.form === node,
					elements: [...(node as HTMLFormElement).elements].map(
						(item) => (item as HTMLInputElement).value,
					),
					checked: [...(node as HTMLFormElement).elements]
						.filter((item) => (item as HTMLInputElement).checked)
						.map((item) => (item as HTMLInputElement).value),
				};
			}),
		).toEqual({ owner: true, elements: ['d', 'b', 'c', 'external'], checked: ['external'] });
		expect(await page.locator('[data-raw]').innerHTML()).toBe('<i>after</i>');
		await page.locator('[data-external]').dispatchEvent('input');
		expect(await page.evaluate(() => window.octaneHostState.events)).toEqual(['external']);
	} finally {
		await page.evaluate(() => window.octaneHostState.unmount());
		await page.close();
	}
});

it('commits keyed multi-select choices while retaining control identity, draft, focus and selection', async () => {
	const page = await openStagePage(browser, process.env.OCTANE_VT_BROWSER_PACKAGE);
	try {
		await page.evaluate(() =>
			window.octaneHostState.mount('select', {
				rows: ['a', 'b', 'c'],
				values: ['a'],
			}),
		);
		const select = await page.locator('select').elementHandle();
		const survivor = await page.locator('option[value=c]').elementHandle();
		const removed = await page.locator('option[value=b]').elementHandle();
		const input = await page.locator('input').elementHandle();
		await input!.evaluate((node) => {
			const input = node as HTMLInputElement;
			input.value = 'user draft';
			input.focus();
			input.setSelectionRange(2, 7, 'backward');
		});
		await page.evaluate(() =>
			window.octaneHostState.update({
				rows: ['a', 'b', 'c'],
				values: ['b', 'c'],
			}),
		);
		await page.waitForFunction(() => window.octaneHostState.prepared);
		const selected = () =>
			select!.evaluate((node) =>
				[...(node as HTMLSelectElement).selectedOptions].map((option) => option.value),
			);
		expect(await selected()).toEqual(['a']);
		await page.evaluate(() => window.octaneHostState.publish());
		expect(await selected()).toEqual(['b', 'c']);
		await page.evaluate(() =>
			window.octaneHostState.update({
				rows: ['a', 'd', 'c'],
				values: ['d'],
			}),
		);
		await page.waitForFunction(() => window.octaneHostState.prepared);
		expect(await selected()).toEqual(['b', 'c']);
		expect(await removed!.evaluate((node) => node.isConnected)).toBe(true);
		await page.evaluate(() => window.octaneHostState.publish());
		expect(await selected()).toEqual(['d']);
		expect(
			await select!.evaluate((node) => ({
				retained: node === document.querySelector('select'),
				value: (node as HTMLSelectElement).value,
				index: (node as HTMLSelectElement).selectedIndex,
				options: [...(node as HTMLSelectElement).options].map((option) => option.value),
			})),
		).toEqual({ retained: true, value: 'd', index: 1, options: ['a', 'd', 'c'] });
		expect(
			await survivor!.evaluate((node) => node === document.querySelector('option[value=c]')),
		).toBe(true);
		expect(await removed!.evaluate((node) => node.isConnected)).toBe(false);
		expect(
			await input!.evaluate((node) => {
				const input = node as HTMLInputElement;
				return {
					focused: document.activeElement === input,
					value: input.value,
					selection: [input.selectionStart, input.selectionEnd, input.selectionDirection],
				};
			}),
		).toEqual({ focused: true, value: 'user draft', selection: [2, 7, 'backward'] });
	} finally {
		await page.evaluate(() => window.octaneHostState.unmount());
		await page.close();
	}
});

it('publishes select multiple changes and fresh options with the accepted value as one update', async () => {
	const page = await openStagePage(browser, process.env.OCTANE_VT_BROWSER_PACKAGE);
	try {
		await page.evaluate(() =>
			window.octaneHostState.mount('select', {
				rows: ['a', 'b', 'c'],
				values: ['a', 'c'],
			}),
		);
		const select = await page.locator('select').elementHandle();
		const state = () =>
			select!.evaluate((node) => {
				const select = node as HTMLSelectElement;
				return {
					multiple: select.multiple,
					selected: [...select.selectedOptions].map((option) => option.value),
				};
			});
		await page.evaluate(() =>
			window.octaneHostState.update({
				rows: ['a', 'b', 'c'],
				values: ['b'],
				multiple: false,
			}),
		);
		await page.waitForFunction(() => window.octaneHostState.prepared);
		expect(await state()).toEqual({ multiple: true, selected: ['a', 'c'] });
		await page.evaluate(() => window.octaneHostState.publish());
		expect(await state()).toEqual({ multiple: false, selected: ['b'] });
		await page.evaluate(() =>
			window.octaneHostState.update({
				rows: ['a', 'd', 'c'],
				values: ['a', 'd'],
				multiple: true,
			}),
		);
		await page.waitForFunction(() => window.octaneHostState.prepared);
		expect(await state()).toEqual({ multiple: false, selected: ['b'] });
		await page.evaluate(() => window.octaneHostState.publish());
		expect(await state()).toEqual({ multiple: true, selected: ['a', 'd'] });
	} finally {
		await page.evaluate(() => window.octaneHostState.unmount());
		await page.close();
	}
});
