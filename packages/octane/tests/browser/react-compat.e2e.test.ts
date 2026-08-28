import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { build, preview, type InlineConfig, type PreviewServer } from 'vite';
import react from '@vitejs/plugin-react';
import { octane } from 'octane/compiler/vite';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { launchBrowser } from '../../../../test-utils/playwright-browser.js';

const HERE = join(dirname(fileURLToPath(import.meta.url)), 'react-compat');
const DEADLINE = 15_000;
let browser: Browser;

beforeAll(async () => {
	browser = await launchBrowser({ headless: true });
});
afterAll(async () => {
	await browser?.close();
});

async function waitText(page: Page, selector: string, text: string) {
	await page.waitForFunction(
		({ selector, text }) => document.querySelector(selector)?.textContent === text,
		{ selector, text },
		{ timeout: DEADLINE },
	);
}

async function paint(page: Page) {
	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
			}),
	);
}

describe.sequential('public ReactCompat with browser scheduling and production React', () => {
	it('server-compiles authored ReactCompat children and context through the public prerender entry', async () => {
		const outDir = await mkdtemp(join(tmpdir(), 'octane-react-compat-ssr-build-'));
		let page: Page | undefined;
		try {
			await build({
				// Both reused fixture modules are project source. A narrower root
				// would classify the siblings as linked Octane package source.
				root: join(HERE, '../..'),
				configFile: false,
				logLevel: 'error',
				plugins: [octane({ requireDirective: true, hmr: false }), react()],
				define: { 'process.env.NODE_ENV': '"production"' },
				oxc: { jsx: { development: false } },
				ssr: { noExternal: ['octane'] },
				build: {
					ssr: join(HERE, 'entry-server.ts'),
					outDir,
					emptyOutDir: false,
					target: 'esnext',
					rolldownOptions: {
						output: { entryFileNames: 'server.mjs', chunkFileNames: '[name]-[hash].mjs' },
					},
				},
			});
			// Only the built fixture's real React peer stays external. Resolve it
			// from Octane's package so SSR and the browser oracle use the same pin.
			await symlink(join(HERE, '../../../node_modules'), join(outDir, 'node_modules'), 'dir');
			const entry = pathToFileURL(join(outDir, 'server.mjs')).href;
			const { stdout } = await promisify(execFile)(
				process.execPath,
				[
					'--input-type=module',
					'-e',
					`const { renderCompiled } = await import(${JSON.stringify(entry)}); process.stdout.write(JSON.stringify(await renderCompiled()));`,
				],
				{ env: { ...process.env, NODE_ENV: 'production' }, timeout: DEADLINE },
			);
			const html = JSON.parse(stdout) as { counter: string; context: string };
			page = await browser.newPage();
			await page.setContent(
				`<section id="counter">${html.counter}</section><section id="context">${html.context}</section>`,
			);
			expect(await page.locator('#counter [data-sibling]').textContent()).toBe('SSR <counter>');
			expect(await page.locator('#counter [data-react-compat] button').textContent()).toBe(
				'SSR <counter>:7',
			);
			expect(await page.locator('#context [data-react-compat] [data-theme]').textContent()).toBe(
				'server theme:0',
			);
		} finally {
			await page?.close();
			await rm(outDir, { recursive: true, force: true });
		}
	}, 60_000);

	for (const mode of ['dev', 'prod'] as const) {
		describe(`${mode} Octane compiler`, () => {
			let server: PreviewServer;
			let outDir: string;
			let origin: string;

			beforeAll(async () => {
				outDir = await mkdtemp(join(tmpdir(), `octane-react-compat-${mode}-`));
				const config: InlineConfig = {
					root: HERE,
					configFile: false,
					logLevel: 'error',
					// Both are real production React builds; only Octane's emitted
					// development instrumentation changes. Neither renderer uses act.
					plugins: [octane({ requireDirective: true, hmr: mode === 'dev' }), react()],
					define: { 'process.env.NODE_ENV': '"production"' },
					// The test process has NODE_ENV=test. Pin the automatic JSX
					// transform too, so it does not request jsxDEV from production React.
					oxc: { jsx: { development: false } },
					build: { outDir, emptyOutDir: false, target: 'esnext' },
				};
				await build(config);
				server = await preview({ ...config, preview: { host: '127.0.0.1', port: 0 } });
				const address = server.httpServer.address();
				if (!address || typeof address === 'string')
					throw new Error('Vite did not expose a TCP port');
				origin = `http://127.0.0.1:${address.port}`;
			}, 60_000);

			afterAll(async () => {
				await server?.close();
				if (outDir) await rm(outDir, { recursive: true, force: true });
			});

			async function openPage() {
				const failures: string[] = [];
				const page = await browser.newPage();
				page.setDefaultTimeout(DEADLINE);
				page.on('pageerror', (error) => {
					failures.push(`pageerror: ${error.message}`);
				});
				page.on('console', (message) => {
					if (message.type() === 'error' || message.type() === 'warning') {
						failures.push(`${message.type()}: ${message.text()}`);
					}
				});
				try {
					await page.goto(origin);
					await page.locator('[data-react-counter]').waitFor();
					await waitText(page, '[data-react-counter]', 'initial:0');
					await waitText(page, '#subscription', 'connected');
					await waitText(page, '#reference', 'attached');
					return { page, failures };
				} catch (error) {
					const body = await page
						.locator('body')
						.innerText()
						.catch(() => 'unavailable');
					await page.close();
					throw new Error(
						`ReactCompat browser did not become ready. DOM: ${body}; diagnostics: ${failures.join('\n')}`,
						{ cause: error },
					);
				}
			}

			async function unmount(page: Page) {
				await page.locator('#unmount').click();
				await page.waitForFunction(
					() =>
						document.getElementById('root')?.textContent === '' &&
						document.querySelector('[data-react-portal]') === null &&
						document.getElementById('subscription')?.textContent === 'disconnected' &&
						document.getElementById('reference')?.textContent === 'detached',
				);
			}

			it('retains React state and DOM through an escaped urgent suspension and a painted fallback', async () => {
				const { page, failures } = await openPage();
				try {
					const original = await page.locator('[data-react-counter]').elementHandle();
					const portal = await page.locator('[data-react-portal]').elementHandle();
					await page.locator('[data-react-counter]').click();
					await waitText(page, '[data-react-counter]', 'initial:1');
					await page.locator('[data-suspend]').click();
					await page.locator('[data-octane-pending]').waitFor();
					await page.locator('[data-react-counter]').waitFor({ state: 'hidden' });
					await page.locator('[data-react-portal]').waitFor({ state: 'hidden' });
					await waitText(page, '#reference', 'detached');
					expect(await page.locator('#subscription').textContent()).toBe('connected');
					await paint(page);
					expect(await page.locator('[data-octane-pending]').isVisible()).toBe(true);

					await page.locator('[data-resolve]').click();
					await waitText(page, '[data-react-counter]', 'resolved:1');
					await page.locator('[data-react-counter]').waitFor({ state: 'visible' });
					await page.locator('[data-octane-pending]').waitFor({ state: 'detached' });
					expect(
						await original!.evaluate(
							(node) => node === document.querySelector('[data-react-counter]'),
						),
					).toBe(true);
					expect(
						await portal!.evaluate(
							(node) => node === document.querySelector('[data-react-portal]'),
						),
					).toBe(true);
					await waitText(page, '[data-react-portal]', 'resolved:portal:1');
					await waitText(page, '#reference', 'attached');
					await page.locator('#focus').click();
					expect(await original!.evaluate((node) => node === document.activeElement)).toBe(true);
					await unmount(page);
					expect(failures).toEqual([]);
				} finally {
					await page.close();
				}
			});

			it('disconnects passive subscriptions while Activity hides a suspended island and reveals without hanging', async () => {
				const { page, failures } = await openPage();
				try {
					const original = await page.locator('[data-react-counter]').elementHandle();
					await page.locator('[data-react-counter]').click();
					await waitText(page, '[data-react-counter]', 'initial:1');
					await page.locator('#ping').click();
					await waitText(page, '#deliveries', '1');
					await page.locator('[data-suspend]').click();
					await page.locator('[data-octane-pending]').waitFor();
					expect(await page.locator('#subscription').textContent()).toBe('connected');
					await page.locator('[data-activity]').click();
					await waitText(page, '#subscription', 'disconnected');
					await waitText(page, '#reference', 'detached');
					await page.locator('[data-react-portal]').waitFor({ state: 'hidden' });
					await page.locator('#ping').click();
					expect(await page.locator('#deliveries').textContent()).toBe('1');
					await page.locator('[data-resolve]').click();
					await paint(page);
					expect(await page.locator('#subscription').textContent()).toBe('disconnected');

					await page.locator('[data-activity]').click();
					await waitText(page, '[data-react-counter]', 'resolved:1');
					await page.locator('[data-react-counter]').waitFor({ state: 'visible' });
					await page.locator('[data-octane-pending]').waitFor({ state: 'detached' });
					await waitText(page, '#subscription', 'connected');
					await waitText(page, '#reference', 'attached');
					expect(
						await original!.evaluate(
							(node) => node === document.querySelector('[data-react-counter]'),
						),
					).toBe(true);
					await page.locator('#ping').click();
					await waitText(page, '#deliveries', '2');
					await unmount(page);
					expect(failures).toEqual([]);
				} finally {
					await page.close();
				}
			});

			it('removes hidden portals and refs permanently when a pending island is deleted', async () => {
				const { page, failures } = await openPage();
				try {
					const original = await page.locator('[data-react-counter]').elementHandle();
					const portal = await page.locator('[data-react-portal]').elementHandle();
					await page.locator('[data-suspend]').click();
					await page.locator('[data-octane-pending]').waitFor();
					await page.locator('[data-activity]').click();
					await waitText(page, '#subscription', 'disconnected');
					await page.locator('[data-remove]').click();
					await page.locator('[data-react-portal]').waitFor({ state: 'detached' });
					await page.locator('[data-react-counter]').waitFor({ state: 'detached' });
					await page.locator('[data-octane-pending]').waitFor({ state: 'detached' });
					await waitText(page, '#reference', 'detached');
					await page.locator('[data-resolve]').click();
					await paint(page);
					expect(await original!.evaluate((node) => node.isConnected)).toBe(false);
					expect(await portal!.evaluate((node) => node.isConnected)).toBe(false);
					expect(await page.locator('[data-react-counter]').count()).toBe(0);
					expect(await page.locator('[data-react-portal]').count()).toBe(0);
					await page.locator('#ping').click();
					expect(await page.locator('#deliveries').textContent()).toBe('0');
					await unmount(page);
					expect(failures).toEqual([]);
				} finally {
					await page.close();
				}
			});

			it('keeps the outer fallback until React is ready when an Octane suspension resolves first', async () => {
				const { page, failures } = await openPage();
				try {
					const original = await page.locator('[data-react-counter]').elementHandle();
					await page.locator('[data-react-counter]').click();
					await waitText(page, '[data-react-counter]', 'initial:1');
					await page.locator('[data-suspend-both]').click();
					await page.locator('[data-octane-pending]').waitFor();
					await page.locator('[data-react-counter]').waitFor({ state: 'hidden' });
					await page.locator('[data-resolve-native]').click();
					await paint(page);
					expect(await page.locator('[data-octane-pending]').isVisible()).toBe(true);
					expect(await page.locator('[data-react-counter]').isVisible()).toBe(false);
					await page.locator('[data-resolve]').click();
					await waitText(page, '[data-react-counter]', 'resolved:1');
					await page.locator('[data-react-counter]').waitFor({ state: 'visible' });
					await page.locator('[data-octane-pending]').waitFor({ state: 'detached' });
					expect(
						await original!.evaluate(
							(node) => node === document.querySelector('[data-react-counter]'),
						),
					).toBe(true);
					await waitText(page, '#reference', 'attached');
					await waitText(page, '#subscription', 'connected');
					await unmount(page);
					expect(failures).toEqual([]);
				} finally {
					await page.close();
				}
			});
		});
	}
});
