import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { octane } from 'octane/compiler/vite';
import { renderToString } from 'octane/server';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServerFixture } from '../../_server-fixture.js';
import {
	RAW_STYLE_MARKER,
	RAW_STYLE_SOURCE,
	UPDATED_RAW_STYLE_MARKER,
} from '../../_fixtures/raw-style-content.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = 'packages/octane/tests/_fixtures/script-innerhtml.tsrx';

let browser: Browser;

beforeAll(async () => {
	try {
		browser = await chromium.launch({ headless: true });
	} catch (error) {
		throw new Error(
			`Chromium is required for raw-style hydration evidence (run \`pnpm --filter octane exec playwright install chromium\`): ${String(error)}`,
		);
	}
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
		id: `/raw-style-hydration-${mode}.tsrx`,
		compileOptions: mode === 'prod' ? { hmr: false } : {},
	});
	const { html } = renderToString(serverModule.RawStyle, {
		tag: 'style',
		source: RAW_STYLE_SOURCE,
	});
	const shellPlugin: Plugin = {
		name: 'raw-style-hydration-shell',
		transformIndexHtml(source) {
			return source.replace('<!--octane-ssr-->', () => html);
		},
	};
	const server = await createServer({
		cacheDir: resolve(HERE, `../../../../../node_modules/.vite/octane-raw-style-hydration-${mode}`),
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
		await page.waitForFunction(() => Boolean(window.__rawStyleHydration));
		return { failures, page, server };
	} catch (error) {
		await Promise.allSettled([page?.close(), server.close()]);
		throw error;
	}
}

describe.sequential('raw <style> real-browser hydration', () => {
	it.each(['dev', 'prod'])(
		'%s adopts server CSS and preserves raw-text semantics through update',
		async (mode) => {
			const { failures, page, server } = await openHydratedPage(mode as 'dev' | 'prod');
			try {
				const state = await page.evaluate(() => window.__rawStyleHydration);
				expect(state.initial).toMatchObject({
					color: 'rgb(1, 2, 3)',
					cssRuleCount: 2,
					styleCount: 1,
					styleSame: true,
					targetSame: true,
					unexpectedElementCount: 0,
				});
				expect(state.initial.content).toContain(RAW_STYLE_MARKER);
				expect(state.initial.styleText).toContain('amp=&');
				expect(state.initial.styleText).toContain('less=<');
				expect(state.initial.styleText).toContain('entity=&amp;');

				expect(state.updated).toMatchObject({
					color: 'rgb(4, 5, 6)',
					cssRuleCount: 2,
					styleCount: 1,
					styleSame: true,
					targetSame: true,
					unexpectedElementCount: 0,
				});
				expect(state.updated.content).toContain(UPDATED_RAW_STYLE_MARKER);
				expect(failures).toEqual([]);
			} finally {
				try {
					await page.evaluate(() => window.__rawStyleHydration.unmount());
				} finally {
					await Promise.allSettled([page.close(), server.close()]);
				}
			}
		},
	);
});
