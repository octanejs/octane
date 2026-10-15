import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page, Route } from 'playwright';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
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
	browser = await launchBrowser({ headless: true });
});

afterAll(async () => {
	await browser?.close();
});

async function openHydratedPage(
	mode: 'dev' | 'prod',
	scripts = false,
): Promise<{
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
	const scriptHtml = scripts
		? renderToString(serverModule.MountedScripts, {
				scripts: [{ id: 'server', source: '(window.scriptExecutions ??= []).push("server")' }],
				revision: 0,
			}).html
		: '';
	const shellPlugin: Plugin = {
		name: 'raw-style-hydration-shell',
		transformIndexHtml(source) {
			return source
				.replace('<!--octane-ssr-->', () => html)
				.replace(
					'</body>',
					() => `${scripts ? `<div id="scripts-root">${scriptHtml}</div>` : ''}</body>`,
				);
		},
		configureServer(server) {
			server.middlewares.use('/execution.js', (_request, response) => {
				response.setHeader('content-type', 'text/javascript');
				response.end('(window.scriptExecutions ??= []).push("external")');
			});
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

describe.sequential('script execution ownership', () => {
	it.each(['dev', 'prod'] as const)(
		'%s leaves dynamically inserted external script ordering to load completion',
		async (mode) => {
			const { failures, page, server } = await openHydratedPage(mode, true);
			const requests = new Map<string, Route>();
			try {
				await page.route('**/ordered-*.js', (route) => {
					requests.set(new URL(route.request().url()).pathname, route);
				});
				for (const defer of [false, true]) {
					const first = `/ordered-first-${defer}.js`;
					const second = `/ordered-second-${defer}.js`;
					await page.evaluate(
						({ first, second, defer }) => {
							window.scriptExecutions = [];
							window.__scriptExecution.render([
								{ id: first, src: first, defer },
								{ id: second, src: second, defer },
								{ id: `inline-${defer}`, source: 'window.scriptExecutions.push("inline")' },
							]);
						},
						{ first, second, defer },
					);
					await expect
						.poll(() => requests.has(first) && requests.has(second), { timeout: 10_000 })
						.toBe(true);
					expect(await page.evaluate(() => window.scriptExecutions)).toEqual(['inline']);
					await requests.get(second)!.fulfill({
						contentType: 'text/javascript',
						body: 'window.scriptExecutions.push("second")',
					});
					requests.delete(second);
					await page.waitForFunction(() => window.scriptExecutions?.includes('second'));
					expect(await page.evaluate(() => window.scriptExecutions)).toEqual(['inline', 'second']);
					await requests.get(first)!.fulfill({
						contentType: 'text/javascript',
						body: 'window.scriptExecutions.push("first")',
					});
					requests.delete(first);
					await page.waitForFunction(() => window.scriptExecutions?.includes('first'));
					expect(await page.evaluate(() => window.scriptExecutions)).toEqual([
						'inline',
						'second',
						'first',
					]);
				}
				expect(failures).toEqual([]);
			} finally {
				await Promise.allSettled([...requests.values()].map((route) => route.abort()));
				await Promise.allSettled([page.close(), server.close()]);
			}
		},
	);

	it.each(['dev', 'prod'] as const)(
		'%s executes fresh opted scripts and retains hydrated or reordered scripts without replay',
		async (mode) => {
			const { failures, page, server } = await openHydratedPage(mode, true);
			try {
				await page.waitForFunction(() => Boolean(window.__scriptExecution));
				expect(await page.evaluate(() => window.__scriptExecution.adopted)).toEqual({
					input: true,
					script: true,
				});
				expect(await page.evaluate(() => window.scriptExecutions)).toEqual(['server']);
				await page.getByLabel('Script draft', { exact: true }).fill('retained');
				await page.evaluate(() =>
					window.__scriptExecution.render([
						{ id: 'inline', source: '(window.scriptExecutions ??= []).push("inline")' },
						{ id: 'external', src: '/execution.js' },
					]),
				);
				await page.waitForFunction(() => window.scriptExecutions?.includes('external'));
				expect(await page.evaluate(() => window.scriptExecutions)).toEqual([
					'server',
					'inline',
					'external',
				]);
				expect(
					await page.locator('#scripts-root script').evaluateAll((nodes) =>
						nodes.map((node) => ({
							nonce: (node as HTMLScriptElement).nonce,
							hint: node.hasAttribute('__executeOnMount'),
						})),
					),
				).toEqual([
					{ nonce: 'script-nonce', hint: false },
					{ nonce: 'script-nonce', hint: false },
				]);
				const unchanged = await page.evaluate(() => {
					const before = Array.from(document.querySelectorAll('#scripts-root script'));
					window.__scriptExecution.render(
						[
							{ id: 'external', src: '/execution.js' },
							{ id: 'inline', source: '(window.scriptExecutions ??= []).push("inline")' },
						],
						1,
					);
					return (
						before[0] === document.querySelectorAll('#scripts-root script')[1] &&
						before[1] === document.querySelectorAll('#scripts-root script')[0]
					);
				});
				expect(unchanged).toBe(true);
				expect(await page.evaluate(() => window.scriptExecutions)).toEqual([
					'server',
					'inline',
					'external',
				]);
				expect(await page.getByLabel('Script draft', { exact: true }).inputValue()).toBe(
					'retained',
				);
				await page.evaluate(() => {
					window.__scriptExecution.render([]);
					window.__scriptExecution.render([
						{ id: 'inline', source: '(window.scriptExecutions ??= []).push("inline")' },
					]);
					window.__scriptExecution.mountStatic();
				});
				expect(await page.evaluate(() => window.scriptExecutions)).toEqual([
					'server',
					'inline',
					'external',
					'inline',
					'static',
					'static',
					'nested',
					'fragment',
					'nested',
					'fragment',
				]);
				// Both owners can mount a hidden primary before a later child suspends.
				// Preserve that existing insertion behavior, and do not replay on cancellation.
				for (const descriptor of [true, false]) {
					const pending = await page.evaluateHandle(
						(value) => window.__scriptExecution.mountPending(value),
						descriptor,
					);
					await expect(page.locator('#pending-script p').textContent()).resolves.toBe(
						'script waiting',
					);
					const event = descriptor ? 'descriptor-pending' : 'pending';
					expect(
						await page.evaluate(
							(name) => window.scriptExecutions?.filter((value) => value === name).length,
							event,
						),
					).toBe(1);
					await pending.evaluate((value) => {
						value.unmount();
						value.resolve();
					});
					await page.evaluate(
						() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
					);
					expect(
						await page.evaluate(
							(name) => window.scriptExecutions?.filter((value) => value === name).length,
							event,
						),
					).toBe(1);
				}
				const asyncScripts = await page.evaluateHandle(() => window.__scriptExecution.mountAsync());
				expect(await page.locator('#async-scripts section > script').count()).toBe(2);
				await page.waitForFunction(
					() => window.scriptExecutions?.filter((value) => value === 'external').length === 3,
				);
				expect(await page.locator('head script[src="/execution.js"]').count()).toBe(0);
				await asyncScripts.evaluate((value) => value.unmount());
				expect(await page.locator('script[src="/execution.js"]').count()).toBe(0);
				expect(await page.evaluate(() => window.__scriptExecution.failures)).toEqual([]);
				expect(failures).toEqual([]);
			} finally {
				await Promise.allSettled([page.close(), server.close()]);
			}
		},
	);
});
