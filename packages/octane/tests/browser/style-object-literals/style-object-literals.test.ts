import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { octane } from 'octane/compiler/vite';
import { renderToString } from 'octane/server';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServerFixture } from '../../_server-fixture.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = 'packages/octane/tests/_fixtures/style-object-shorthand.tsrx';

let browser: Browser;

beforeAll(async () => {
	browser = await launchBrowser({ headless: true });
});

afterAll(async () => {
	await browser?.close();
});

async function openHydratedPage(mode: 'dev' | 'prod'): Promise<{
	failures: string[];
	page: Page;
	server: ViteDevServer;
}> {
	const serverModule = loadServerFixture(FIXTURE, {
		id: `/style-object-shorthand-${mode}.tsrx`,
		compileOptions: mode === 'prod' ? { hmr: false } : {},
	});
	const { html } = renderToString(serverModule.ShorthandStyles, {
		discarded: '1px',
		margin: '4px',
		top: '8px',
	});
	const shellPlugin: Plugin = {
		name: 'style-object-hydration-shell',
		transformIndexHtml(source) {
			return source.replace('<!--octane-ssr-->', () => html);
		},
	};
	const server = await createServer({
		cacheDir: resolve(HERE, `../../../../../node_modules/.vite/octane-style-objects-${mode}`),
		configFile: false,
		root: HERE,
		logLevel: 'error',
		plugins: [shellPlugin, octane(mode === 'prod' ? { hmr: false } : {})],
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
		await page.waitForFunction(() => Boolean(window.__styleObjectHydration));
		return { failures, page, server };
	} catch (error) {
		await Promise.allSettled([page?.close(), server.close()]);
		throw error;
	}
}

// Shorthand parsing must run in a browser: jsdom discards a trailing
// margin-top declaration when parsing a style attribute containing margin.
describe.sequential('inline style object real-browser hydration', () => {
	for (const mode of ['dev', 'prod'] as const) {
		it(`${mode} preserves duplicate shorthand ordering through hydration and updates`, async () => {
			const { failures, page, server } = await openHydratedPage(mode);
			try {
				const state = await page.evaluate(() => window.__styleObjectHydration);
				expect(state.before).toMatchObject([
					{ id: 'longhand-first', top: '4px', right: '4px', same: true },
					{ id: 'shorthand-first', top: '8px', right: '4px', same: true },
				]);
				expect(
					state.before.map((element) =>
						element
							.style!.split(';')
							.filter(Boolean)
							.map((declaration) => declaration.replace(/\s/g, '')),
					),
				).toEqual([
					['margin-top:8px', 'margin:4px'],
					['margin:4px', 'margin-top:8px'],
				]);
				expect(state.hydrated).toEqual(state.before);
				expect(state.updated).toMatchObject([
					{ id: 'longhand-first', top: '12px', right: '12px', same: true },
					{ id: 'shorthand-first', top: '16px', right: '12px', same: true },
				]);
				expect(state.removed).toMatchObject([
					{ id: 'longhand-first', top: '', right: '', same: true },
					{ id: 'shorthand-first', top: '', right: '', same: true },
				]);
				expect(failures).toEqual([]);
			} finally {
				try {
					await page.evaluate(() => window.__styleObjectHydration.unmount());
				} finally {
					await Promise.allSettled([page.close(), server.close()]);
				}
			}
		});
	}
});
