import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from 'octane/compiler/vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
let browser: Browser;

beforeAll(async () => {
	browser = await launchBrowser({ headless: true });
});

afterAll(async () => {
	await browser?.close();
});

async function openPage(
	mode: 'dev' | 'prod',
	placement: 'inside' | 'outside',
): Promise<{
	failures: string[];
	page: Page;
	server: ViteDevServer;
}> {
	const server = await createServer({
		cacheDir: resolve(
			HERE,
			`../../../../../node_modules/.vite/octane-activity-view-transition-${mode}`,
		),
		configFile: false,
		root: HERE,
		logLevel: 'error',
		plugins: [octane(mode === 'prod' ? { hmr: false } : {})],
		server: { host: '127.0.0.1', port: 0 },
	});
	const failures: string[] = [];
	let page: Page | undefined;
	try {
		await server.listen();
		const address = server.httpServer!.address();
		if (!address || typeof address === 'string') throw new Error('Vite did not expose a TCP port');
		page = await browser.newPage();
		page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
		page.on('console', (message) => {
			if (message.type() === 'error' || message.type() === 'warning') {
				failures.push(`${message.type()}: ${message.text()}`);
			}
		});
		await page.goto(`http://127.0.0.1:${address.port}/?placement=${placement}`);
		await page.waitForFunction(() => Boolean(window.__activityViewTransition));
		return { failures, page, server };
	} catch (error) {
		await Promise.allSettled([page?.close(), server.close()]);
		throw error;
	}
}

async function transition(page: Page, mode: 'visible' | 'hidden', text: string) {
	const mark = await page.evaluate(
		({ mode, text }) => window.__activityViewTransition.render(mode, text),
		{ mode, text },
	);
	await page.waitForFunction(
		({ mode, text }) => {
			const panel = document.querySelector('#activity-transition-panel') as HTMLElement;
			return (
				panel.querySelector('span')!.textContent === text &&
				(getComputedStyle(panel).display === 'none') === (mode === 'hidden')
			);
		},
		{ mode, text },
	);
	return page.evaluate((mark) => window.__activityViewTransition.settle(mark), mark);
}

describe.sequential('Activity View Transitions in a real browser', () => {
	it.each([
		['dev', 'inside'],
		['dev', 'outside'],
		['prod', 'inside'],
		['prod', 'outside'],
	] as const)(
		'%s preserves Activity %s ViewTransition across native enter/exit',
		async (mode, placement) => {
			const { failures, page, server } = await openPage(mode, placement);
			try {
				const initial = await page.evaluate(() => window.__activityViewTransition.snapshot());
				expect(initial).toEqual({
					connected: true,
					hidden: true,
					panelIdentity: true,
					inputIdentity: true,
					inputValue: 'draft',
					text: 'initial',
					transitionName: '',
				});

				const revealed = await transition(page, 'visible', 'initial');
				expect(revealed).toMatchObject({ ...initial, hidden: false });
				expect(revealed.events).toEqual([
					{ kind: 'enter', name: 'activity-panel', hasAnimation: true },
				]);
				expect(revealed.nativeCalls).toEqual([
					{ ready: 'fulfilled', update: 'fulfilled', finished: 'fulfilled' },
				]);
				await page.locator('#activity-transition-input').fill('preserved draft');

				const updated = await transition(page, 'visible', 'longer visible content');
				expect(updated).toMatchObject({
					...initial,
					hidden: false,
					inputValue: 'preserved draft',
					text: 'longer visible content',
				});
				expect(updated.events).toEqual([
					{ kind: 'update', name: 'activity-panel', hasAnimation: true },
				]);

				const hidden = await transition(page, 'hidden', 'longer visible content');
				expect(hidden).toMatchObject({
					...initial,
					inputValue: 'preserved draft',
					text: 'longer visible content',
				});
				expect(hidden.events).toEqual([
					{ kind: 'exit', name: 'activity-panel', hasAnimation: true },
				]);
				expect(hidden.nativeCalls).toEqual([
					{ ready: 'fulfilled', update: 'fulfilled', finished: 'fulfilled' },
				]);

				const background = await transition(page, 'hidden', 'background content');
				expect(background).toMatchObject({
					...initial,
					inputValue: 'preserved draft',
					text: 'background content',
				});
				expect(background.events).toEqual([]);
				// Skipping before the native API call is also valid. If a transition was
				// started to apply this commit, native `ready` must reject (no animation)
				// while the actual update and completion still succeed.
				for (const call of background.nativeCalls) {
					expect(call).toEqual({ ready: 'rejected', update: 'fulfilled', finished: 'fulfilled' });
				}

				const restored = await transition(page, 'visible', 'background content');
				expect(restored).toMatchObject({
					...initial,
					hidden: false,
					inputValue: 'preserved draft',
					text: 'background content',
				});
				expect(restored.events).toEqual([
					{ kind: 'enter', name: 'activity-panel', hasAnimation: true },
				]);
				expect(failures).toEqual([]);
			} finally {
				try {
					await page.evaluate(() => window.__activityViewTransition.unmount());
				} finally {
					await Promise.allSettled([page.close(), server.close()]);
				}
			}
		},
	);
});
