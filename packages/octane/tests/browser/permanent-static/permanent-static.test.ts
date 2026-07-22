import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { renderToString } from 'octane/server';
import { octane } from 'octane/compiler/vite';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServerFixture } from '../../_server-fixture.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = 'packages/octane/tests/_fixtures/permanent-static-browser.tsrx';

let browser: Browser;

beforeAll(async () => {
	try {
		browser = await chromium.launch({ headless: true });
	} catch (error) {
		throw new Error(
			`Chromium is required for permanent-static browser evidence (run \`pnpm --filter octane exec playwright install chromium\`): ${String(error)}`,
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
		id: `/permanent-static-browser-${mode}.tsrx`,
		compileOptions: mode === 'prod' ? { hmr: false } : {},
	});
	const { html } = renderToString(serverModule.PermanentStaticBrowser, {
		label: 'Server live action',
		onStaticRender: () => {},
	});
	const shellPlugin: Plugin = {
		name: 'permanent-static-browser-shell',
		transformIndexHtml(source) {
			return source.replace('<!--octane-ssr-->', () => html);
		},
	};
	const server = await createServer({
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
		await page.waitForFunction(() => Boolean(window.__permanentStaticBrowser));
		return { failures, page, server };
	} catch (error) {
		await Promise.allSettled([page?.close(), server.close()]);
		throw error;
	}
}

describe.sequential('permanent-static real-browser hydration', () => {
	for (const mode of ['dev', 'prod'] as const) {
		it(`${mode} preserves wrapper-free foreign and externally managed DOM`, async () => {
			const { failures, page, server } = await openHydratedPage(mode);
			try {
				const initial = await page.evaluate(() => window.__permanentStaticBrowser.state());
				expect(initial).toMatchObject({
					childIds: [
						'static-browser-article',
						'static-browser-svg',
						'static-browser-math',
						'static-browser-live-action',
					],
					externalPreserved: true,
					identity: {
						article: true,
						layout: true,
						liveAction: true,
						mathRow: true,
						svgGroup: true,
					},
					live: {
						clickedId: null,
						label: 'Updated live action',
					},
					namespaces: {
						math: 'http://www.w3.org/1998/Math/MathML',
						svg: 'http://www.w3.org/2000/svg',
					},
					wrapperFree: {
						math: true,
						svg: true,
					},
					staticRenderCount: 0,
				});
				expect(initial.live.id).toBe(initial.live.serverId);

				await page.locator('#static-browser-live-action').click();
				const afterClick = await page.evaluate(() => window.__permanentStaticBrowser.state());
				expect(afterClick.live.clickedId).toBe(afterClick.live.id);
				expect(afterClick.externalPreserved).toBe(true);
				expect(failures).toEqual([]);
			} finally {
				await Promise.all([page.close(), server.close()]);
			}
		});
	}
});
