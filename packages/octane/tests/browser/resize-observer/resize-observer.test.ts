import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from 'octane/compiler/vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {} from './main.js';

const HERE = dirname(fileURLToPath(import.meta.url));

for (const compileMode of ['dev', 'prod'] as const) {
	describe.sequential(`${compileMode}: deferred element size observations`, () => {
		let server: ViteDevServer;
		let browser: Browser;
		let baseUrl: string;
		let ssrHtml: string;
		let page: Page | undefined;
		let failures: string[] = [];
		let expectedError: string | undefined;

		beforeAll(async () => {
			server = await createServer({
				configFile: false,
				root: HERE,
				logLevel: 'error',
				cacheDir: resolve(
					HERE,
					`../../../../../node_modules/.vite/octane-resize-observer-${compileMode}`,
				),
				plugins: [octane({ hmr: compileMode === 'dev' })],
				server: { host: '127.0.0.1', port: 0 },
			});
			const serverModule = await server.ssrLoadModule('/server.ts');
			ssrHtml = serverModule.render();
			await server.listen();
			const address = server.httpServer!.address();
			if (!address || typeof address === 'string') throw new Error('No Vite TCP port');
			baseUrl = `http://127.0.0.1:${address.port}`;
			browser = await launchBrowser({ headless: true });
		});

		afterEach(async () => {
			const errors = failures.filter((error) => !expectedError || !error.includes(expectedError));
			await page?.close();
			page = undefined;
			failures = [];
			expectedError = undefined;
			expect(errors).toEqual([]);
		});

		afterAll(async () => {
			await browser?.close();
			await server?.close();
		});

		async function openCase(timerFallback = false): Promise<Page> {
			page = await browser.newPage();
			page.on('pageerror', (error) => failures.push(error.message));
			page.on('console', (message) => {
				if (message.type() === 'warning' || message.type() === 'error')
					failures.push(message.text());
			});
			if (timerFallback)
				await page.addInitScript(() => {
					Object.defineProperty(window, 'MessageChannel', { configurable: true, value: undefined });
				});
			await page.goto(baseUrl);
			await page.waitForFunction(() => Boolean(window.__resizeObserverCases));
			return page;
		}

		it('coalesces the latest entry for each target while preserving native observer identity', async () => {
			const page = await openCase();
			const result = await page.evaluate(() => window.__resizeObserverCases.coalesce());
			expect(result).toEqual({
				deliveries: [
					[
						{ target: 'first', width: 120, borderWidth: 150 },
						{ target: 'second', width: 240, borderWidth: 270 },
					],
				],
				identity: { native: true, observer: true, receiver: true, constructor: true },
				errors: [],
			});
		});

		it('cancels queued observations after disconnection', async () => {
			const page = await openCase();
			expect(await page.evaluate(() => window.__resizeObserverCases.cancel('disconnect'))).toEqual({
				deliveries: [],
				errors: [],
			});
		});

		it('removes an unobserved target from a queued delivery without discarding other targets', async () => {
			const page = await openCase();
			expect(await page.evaluate(() => window.__resizeObserverCases.cancel('unobserve'))).toEqual({
				deliveries: [[{ target: 'second', width: 200, borderWidth: 230 }]],
				errors: [],
			});
		});

		it('keeps pending observations when the same target and box are observed again', async () => {
			const page = await openCase();
			expect(await page.evaluate(() => window.__resizeObserverCases.cancel('repeat'))).toEqual({
				deliveries: [
					[
						{ target: 'first', width: 100, borderWidth: 130 },
						{ target: 'second', width: 200, borderWidth: 230 },
					],
				],
				errors: [],
			});
		});

		it('reobserves a target with a changed box and delivers border-only changes', async () => {
			const page = await openCase();
			expect(await page.evaluate(() => window.__resizeObserverCases.boxChanges())).toEqual({
				initial: [{ target: 'target', width: 100, borderWidth: 130 }],
				reobserved: [{ target: 'target', width: 160, borderWidth: 210 }],
				borderChange: [{ target: 'target', width: 160, borderWidth: 230 }],
				errors: [],
			});
		});

		it('uses a supplied iframe native constructor and preserves its callback identity', async () => {
			const page = await openCase();
			expect(await page.evaluate(() => window.__resizeObserverCases.iframe())).toEqual({
				entries: [{ target: 'iframe-target', width: 75, borderWidth: 105 }],
				native: true,
				observer: true,
				receiver: true,
				errors: [],
			});
		});

		it('converts a box option once and keeps pending entries when observed again with the equivalent primitive', async () => {
			const page = await openCase();
			expect(await page.evaluate(() => window.__resizeObserverCases.convertedOptions())).toEqual({
				entries: [
					{ target: 'first', width: 100, borderWidth: 130 },
					{ target: 'second', width: 200, borderWidth: 230 },
				],
				getterReads: 1,
				conversions: 1,
				errors: [],
			});
		});

		it('rejects non-callable callbacks immediately and validates the native receiver and target before reading options', async () => {
			const page = await openCase();
			expect(await page.evaluate(() => window.__resizeObserverCases.validation())).toEqual({
				callbackFailures: [true, true, true, true],
				getterReads: 0,
				receiverFailure: true,
				targetFailure: true,
				errors: [],
			});
		});

		it('invokes a callable callback without consulting its own call property', async () => {
			const page = await openCase();
			expect(await page.evaluate(() => window.__resizeObserverCases.ownCallProperty())).toEqual({
				callbackCalled: true,
				ownCallCalled: false,
				receiver: true,
				identity: true,
				errors: [],
			});
		});

		it('reports asynchronous callback errors while delivering another observer', async () => {
			const page = await openCase();
			expectedError = 'resize-observer callback failure';
			const result = await page.evaluate(() => window.__resizeObserverCases.callbackError());
			expect(result.entries).toEqual([{ target: 'surviving', width: 200, borderWidth: 230 }]);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain(expectedError);
		});

		for (const timerFallback of [false, true]) {
			it(`converges measured layout without a loop warning${timerFallback ? ' without MessageChannel' : ''}`, async () => {
				const page = await openCase(timerFallback);
				await page.evaluate(() => window.__resizeObserverCases.mount(true));
				await page.waitForFunction(
					() => window.__resizeObserverCases.ready && window.__resizeObserverCases.width() === 140,
				);
				const state = await page.evaluate(async () => {
					const api = window.__resizeObserverCases;
					await api.settle();
					return { width: api.width(), errors: api.errors };
				});
				expect(state).toEqual({ width: 140, errors: [] });
			});
		}

		it('adopts server-rendered elements and converges after hydration without a loop warning', async () => {
			const page = await openCase();
			await page.evaluate((html) => window.__resizeObserverCases.hydrate(html), ssrHtml);
			await page.waitForFunction(
				() => window.__resizeObserverCases.ready && window.__resizeObserverCases.width() === 140,
			);
			const state = await page.evaluate(async () => {
				const api = window.__resizeObserverCases;
				await api.settle();
				return { width: api.width(), adopted: api.adopted(), errors: api.errors };
			});
			expect(state).toEqual({ width: 140, adopted: true, errors: [] });
		});

		it('preserves ordinary state updates at the next microtask', async () => {
			const page = await openCase();
			await page.evaluate(() => window.__resizeObserverCases.mount(false));
			await page.waitForFunction(() => window.__resizeObserverCases.ready);
			const widths = await page.evaluate(async () => {
				const api = window.__resizeObserverCases;
				const before = api.width();
				api.update(180);
				const during = api.width();
				await 0;
				return { before, during, after: api.width(), errors: api.errors };
			});
			expect(widths).toEqual({ before: 100, during: 100, after: 180, errors: [] });
		});
	});
}
