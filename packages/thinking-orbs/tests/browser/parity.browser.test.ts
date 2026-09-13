import { resolve } from 'node:path';
import { createServer as createNetServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { launchBrowser } from '../../../../test-utils/playwright-browser.js';
import { octane } from '../../../octane/src/compiler/vite.js';
import { renderHydrationFixture } from '../../../octane/tests/_hydration-ssr.js';
import type { Page } from 'playwright';

const root = resolve(import.meta.dirname, 'harness');
let server: ViteDevServer;
let origin: string;

beforeAll(async () => {
	const markup = await renderHydrationFixture(
		'thinking-orbs',
		'packages/thinking-orbs/tests/browser/harness/app.tsrx',
		'OrbGrid',
		{ ids: ['a', 'b'], state: 'working', size: 20, theme: 'light', paused: true },
	);
	expect(markup.html.match(/<canvas\b/g)).toHaveLength(2);
	expect(markup.html).toContain('aria-label="Working…"');
	const port = await new Promise<number>((resolvePort, reject) => {
		const socket = createNetServer();
		socket.once('error', reject);
		socket.listen(0, '127.0.0.1', () => {
			const address = socket.address();
			if (!address || typeof address === 'string') throw new Error('Missing port');
			socket.close(() => resolvePort(address.port));
		});
	});
	server = await createServer({
		configFile: false,
		root,
		logLevel: 'error',
		plugins: [
			octane(),
			{
				name: 'thinking-orbs-ssr-fixture',
				transformIndexHtml: (html) => html.replace('<!--SSR-->', markup.html),
			},
		],
		resolve: {
			alias: [
				{ find: /^@octanejs\/thinking-orbs$/, replacement: resolve(root, '../../../src/index.ts') },
				{ find: /^octane$/, replacement: resolve(root, '../../../../octane/src/index.ts') },
			],
		},
		server: { host: '127.0.0.1', port, strictPort: true },
	});
	await server.listen();
	const address = server.httpServer!.address();
	if (!address || typeof address === 'string') throw new Error('Missing browser fixture port');
	origin = `http://127.0.0.1:${address.port}`;
}, 60_000);
afterAll(async () => {
	await server?.close();
});

async function pixels(page: Page, selector: string) {
	return page.locator(selector).evaluate((node: HTMLCanvasElement) => node.toDataURL());
}
async function withPage(run: (page: Page) => Promise<void>) {
	const browser = await launchBrowser({ headless: true });
	const page = await browser.newPage({ reducedMotion: 'reduce' });
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	try {
		await page.goto(origin);
		await page.waitForFunction(
			() => window.orbHarness && document.querySelector('#reference canvas'),
		);
		await run(page);
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
	}
}

describe('Thinking Orbs browser parity', () => {
	// @parity-case thinking-orbs:browser:1
	it('hydrates retained canvases and preserves pixels, refs, native events and keyed identity through updates', async () => {
		await withPage(async (page) => {
			await expect
				.poll(
					async () =>
						(await pixels(page, '[data-orb="a"]')) === (await pixels(page, '#reference canvas')),
				)
				.toBe(true);
			expect(
				await page.evaluate(() =>
					[...document.querySelectorAll('#root canvas')].every(
						(node, i) => node === window.orbHarness.serverCanvases[i],
					),
				),
			).toBe(true);
			expect(
				await page.locator('[data-orb="a"]').evaluate((node: HTMLCanvasElement) => node.width),
			).toBe(20);
			expect(
				await page.locator('[data-orb="a"]').evaluate((node: HTMLCanvasElement) =>
					node
						.getContext('2d')!
						.getImageData(0, 0, 20, 20)
						.data.some((value) => value !== 0),
				),
			).toBe(true);
			await page.locator('[data-orb="a"]').click();
			expect(await page.evaluate(() => window.orbHarness.clicks)).toBe(1);
			await page.evaluate(() => window.orbHarness.update({ ids: ['b', 'a'] }));
			expect(
				await page.evaluate(() => document.activeElement === window.orbHarness.serverCanvases[0]),
			).toBe(true);
			expect(
				await page.evaluate(() => window.orbHarness.refs.a === window.orbHarness.serverCanvases[0]),
			).toBe(true);
			await page.evaluate(() =>
				window.orbHarness.update({ state: 'connecting', size: 64, theme: 'dark' }),
			);
			await expect
				.poll(
					async () =>
						(await pixels(page, '[data-orb="a"]')) === (await pixels(page, '#reference canvas')),
				)
				.toBe(true);
			expect(await page.locator('[data-orb="a"]').getAttribute('aria-label')).toBe('Connecting…');
			for (const state of [
				'working',
				'searching',
				'solving',
				'listening',
				'connecting',
				'weaving',
				'composing',
				'breathing',
				'shaping',
			] as const) {
				for (const size of [20, 64] as const) {
					for (const theme of ['light', 'dark'] as const) {
						await page.evaluate((next) => window.orbHarness.update(next), { state, size, theme });
						await expect
							.poll(
								async () =>
									(await pixels(page, '[data-orb="a"]')) ===
									(await pixels(page, '#reference canvas')),
							)
							.toBe(true);
					}
				}
			}
			await page.evaluate(() => window.orbHarness.update({ ids: ['a'] }));
			expect(await page.evaluate(() => window.orbHarness.refs.b)).toBeNull();
			await page.evaluate(() => window.orbHarness.unmount());
			expect(
				await page.evaluate(() =>
					Object.values(window.orbHarness.refs).every((node) => node === null),
				),
			).toBe(true);
			expect(await page.locator('#root canvas').count()).toBe(0);
		});
	});

	// @parity-case thinking-orbs:browser:2
	it('stops drawing when paused and after an animated canvas is unmounted', async () => {
		await withPage(async (page) => {
			await page.emulateMedia({ reducedMotion: 'no-preference' });
			await page.evaluate(() => window.orbHarness.update({ paused: false, size: 64 }));
			const initial = await pixels(page, '[data-orb="a"]');
			await expect.poll(() => pixels(page, '[data-orb="a"]')).not.toBe(initial);
			await page.evaluate(() => window.orbHarness.update({ paused: true }));
			const paused = await pixels(page, '[data-orb="a"]');
			await page.waitForTimeout(150);
			expect(await pixels(page, '[data-orb="a"]')).toBe(paused);
			await page.evaluate(() => window.orbHarness.update({ paused: false }));
			await expect.poll(() => pixels(page, '[data-orb="a"]')).not.toBe(paused);
			const detached = await page.evaluateHandle(() => window.orbHarness.refs.a!);
			await page.evaluate(() => window.orbHarness.unmount());
			const stopped = await detached.evaluate((node) => node.toDataURL());
			await page.waitForTimeout(150);
			expect(await detached.evaluate((node) => node.toDataURL())).toBe(stopped);
		});
	});
});
