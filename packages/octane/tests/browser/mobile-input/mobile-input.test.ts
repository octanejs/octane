import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { devices, launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from 'octane/compiler/vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
let page: Page | undefined;
let failures: string[] = [];

beforeAll(async () => {
	server = await createServer({
		cacheDir: resolve(HERE, '../../../../../node_modules/.vite/octane-mobile-input'),
		configFile: false,
		root: HERE,
		logLevel: 'error',
		plugins: [octane()],
		server: { host: '127.0.0.1', port: 0 },
	});
	await server.listen();
	const address = server.httpServer!.address();
	if (!address || typeof address === 'string') throw new Error('Vite did not expose a TCP port');
	baseUrl = `http://127.0.0.1:${address.port}`;
	browser = await launchBrowser({ headless: true });
});

afterEach(async () => {
	const errors = failures.slice();
	try {
		await page?.close();
	} finally {
		page = undefined;
		failures = [];
	}
	expect(errors).toEqual([]);
});

afterAll(async () => {
	await browser?.close();
	await server?.close();
});

async function openCase(mobile: boolean, legacyMovement = false): Promise<Page> {
	page = await browser.newPage(mobile ? devices['Galaxy S9+'] : undefined);
	failures = [];
	page.on('pageerror', (error) => failures.push(error.message));
	if (legacyMovement) {
		await page.addInitScript(() => {
			Object.defineProperty(Element.prototype, 'moveBefore', {
				configurable: true,
				value: undefined,
			});
		});
	}
	await page.goto(baseUrl);
	await page.waitForFunction(() => Boolean(window.__mobileInput));
	return page;
}

const compositionCases = [
	...([1, 2, 3, 4] as const).map((id) => ({
		kind: 'compiled' as const,
		id,
		mobile: false,
		legacy: false,
		shadow: false,
	})),
	...([1, 2, 3, 4] as const).map((id) => ({
		kind: 'compiled' as const,
		id,
		mobile: true,
		legacy: true,
		shadow: false,
	})),
	...([1, 2, 3, 4] as const).map((id) => ({
		kind: 'descriptor' as const,
		id,
		mobile: true,
		legacy: false,
		shadow: false,
	})),
	...([1, 2, 3, 4] as const).map((id) => ({
		kind: 'descriptor' as const,
		id,
		mobile: true,
		legacy: true,
		shadow: false,
	})),
	{ kind: 'compiled' as const, id: 2, mobile: true, legacy: false, shadow: true },
	{ kind: 'compiled' as const, id: 2, mobile: true, legacy: true, shadow: true },
	{ kind: 'descriptor' as const, id: 3, mobile: true, legacy: false, shadow: true },
	{ kind: 'descriptor' as const, id: 3, mobile: true, legacy: true, shadow: true },
];

describe.sequential('real-browser mobile input continuity', () => {
	it.each(compositionCases)(
		'preserves active Korean composition through $kind row $id reorder (mobile=$mobile, legacy=$legacy, shadow=$shadow)',
		async ({ kind, id, mobile, legacy, shadow }) => {
			const current = await openCase(mobile, legacy);
			await current.evaluate(
				({ listKind, focusedId, insideShadow }) => {
					window.__mobileInput.mount(listKind, focusedId, insideShadow);
				},
				{ listKind: kind, focusedId: id, insideShadow: shadow },
			);
			const input = current.locator(
				kind === 'compiled' ? '.nested-conditional-editor' : `[data-row="${id}"]`,
			);
			await input.fill('');
			await input.focus();
			const cdp = await current.context().newCDPSession(current);
			await cdp.send('Input.imeSetComposition', {
				text: '한',
				selectionStart: 1,
				selectionEnd: 1,
			});
			const composing = await current.evaluate(() => window.__mobileInput.snapshot());
			expect(composing).toMatchObject({
				focused: true,
				connected: true,
				same: true,
				value: '한',
				interruptions: [],
			});
			expect(composing.compositions).toContain('compositionstart:');

			const moved = await current.evaluate(() => window.__mobileInput.reverse());
			expect(moved).toMatchObject({
				order: [4, 3, 2, 1],
				focused: true,
				connected: true,
				same: true,
				value: '한',
				interruptions: [],
			});

			await cdp.send('Input.imeSetComposition', {
				text: '한국',
				selectionStart: 2,
				selectionEnd: 2,
			});
			const updated = await current.evaluate(() => window.__mobileInput.snapshot());
			expect(updated.value).toBe('한국');
			expect(updated.compositions.filter((event) => event.startsWith('compositionstart:'))).toEqual(
				['compositionstart:'],
			);
			expect(updated.interruptions).toEqual([]);

			await cdp.send('Input.insertText', { text: '한국' });
			const committed = await current.evaluate(() => window.__mobileInput.snapshot());
			expect(committed.value).toBe('한국');
			expect(committed.compositions).toContain('compositionend:한국');
			expect(committed.interruptions).toEqual([]);
		},
	);

	it.each([
		{ kind: 'compiled' as const, id: 2 },
		{ kind: 'descriptor' as const, id: 3 },
	])('restores a blurred $kind shadow-root editor and its selection', async ({ kind, id }) => {
		const current = await openCase(true, true);
		const restored = await current.evaluate(
			({ listKind, focusedId }) => {
				window.__mobileInput.mount(listKind, focusedId, true);
				const host = document.querySelector<HTMLElement>('#shadow-host')!;
				const shadow = host.shadowRoot!;
				const input =
					listKind === 'compiled'
						? shadow.querySelector<HTMLInputElement>('.nested-conditional-editor')!
						: shadow.querySelector<HTMLInputElement>(`[data-row="${focusedId}"]`)!;
				input.focus();
				input.setSelectionRange(2, 9);
				const parent = shadow.querySelector(
					listKind === 'compiled' ? '#nested-conditional-list' : '#descriptor-rows',
				)!;
				const originalInsert = parent.insertBefore;
				let lostFocus = false;
				parent.insertBefore = function <T extends Node>(node: T, anchor: Node | null): T {
					const result = originalInsert.call(this, node, anchor) as T;
					if (!lostFocus) {
						input.blur();
						input.setSelectionRange(0, 0);
						lostFocus = shadow.activeElement !== input;
					}
					return result;
				};
				try {
					return {
						...window.__mobileInput.reverse(),
						lostFocus,
						documentFocused: document.activeElement === host,
					};
				} finally {
					parent.insertBefore = originalInsert;
				}
			},
			{ listKind: kind, focusedId: id },
		);

		expect(restored).toMatchObject({
			order: [4, 3, 2, 1],
			lostFocus: true,
			documentFocused: true,
			focused: true,
			connected: true,
			same: true,
			selection: [2, 9],
		});
		expect(restored.interruptions).toEqual(['blur', 'focusout']);
	});

	it.each([
		{ name: 'touchstart' as const, capture: false },
		{ name: 'touchstart' as const, capture: true },
		{ name: 'touchmove' as const, capture: false },
		{ name: 'touchmove' as const, capture: true },
	])(
		'allows body-root $name handlers to cancel native gestures (capture=$capture)',
		async (test) => {
			const current = await openCase(true);
			const canceled = await current.evaluate(
				({ name, capture }) => window.__mobileInput.cancelBodyTouch(name, capture),
				test,
			);
			expect(canceled).toEqual({ observed: true, defaultPrevented: true });
		},
	);
});
