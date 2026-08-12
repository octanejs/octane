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

async function openPage(mode: 'dev' | 'prod'): Promise<{
	failures: string[];
	page: Page;
	server: ViteDevServer;
}> {
	const server = await createServer({
		cacheDir: resolve(HERE, `../../../../../node_modules/.vite/octane-portal-placement-${mode}`),
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
		if (!address || typeof address === 'string') {
			throw new Error('Vite did not expose a TCP port');
		}

		page = await browser.newPage();
		page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
		page.on('console', (message) => {
			if (message.type() === 'error' || message.type() === 'warning') {
				failures.push(`${message.type()}: ${message.text()}`);
			}
		});
		await page.goto(`http://127.0.0.1:${address.port}`);
		await page.waitForFunction(() => Boolean(window.__portalPlacement));
		return { failures, page, server };
	} catch (error) {
		await Promise.allSettled([page?.close(), server.close()]);
		throw error;
	}
}

describe.sequential('portal absolute placement in a real browser', () => {
	it.each(['dev', 'prod'])(
		'%s preserves absolute order without reattaching stable host nodes',
		async (mode) => {
			const { failures, page, server } = await openPage(mode as 'dev' | 'prod');
			try {
				const initial = await page.evaluate(() => window.__portalPlacement.snapshot());
				expect(initial).toEqual({
					identity: {
						foreignAfter: true,
						foreignBefore: true,
						parent: true,
						second: true,
						third: true,
					},
					portalSlots: ['foreign-before', 'portalled', 'foreign-after'],
					rootSlots: ['second', 'third'],
					tick: '0',
				});

				const inline = await page.evaluate(() => window.__portalPlacement.setMode('inline'));
				expect(inline).toMatchObject({
					identity: {
						foreignAfter: true,
						foreignBefore: true,
						parent: true,
						second: true,
						third: true,
					},
					portalSlots: ['foreign-before', 'foreign-after'],
					rootSlots: ['first', 'second', 'third'],
				});

				const empty = await page.evaluate(() => window.__portalPlacement.setMode('null'));
				expect(empty.rootSlots).toEqual(['second', 'third']);
				const rematerialized = await page.evaluate(() =>
					window.__portalPlacement.setMode('inline'),
				);
				expect(rematerialized.rootSlots).toEqual(['first', 'second', 'third']);

				const stable = await page.evaluate(() => window.__portalPlacement.stableRerender());
				expect(stable).toMatchObject({
					addedNodeCount: 0,
					childListRecordCount: 0,
					identity: {
						foreignAfter: true,
						foreignBefore: true,
						parent: true,
						second: true,
						third: true,
					},
					portalSlots: ['foreign-before', 'foreign-after'],
					rootSlots: ['first', 'second', 'third'],
					settledIdentity: {
						first: true,
						second: true,
						third: true,
					},
					tick: '1',
				});
				expect(failures).toEqual([]);
			} finally {
				try {
					await page.evaluate(() => window.__portalPlacement.unmount());
				} finally {
					await Promise.allSettled([page.close(), server.close()]);
				}
			}
		},
	);
});
