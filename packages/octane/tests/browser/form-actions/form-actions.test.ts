import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import {
	build,
	createServer,
	preview,
	type Plugin,
	type PreviewServer,
	type ViteDevServer,
} from 'vite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { octane } from 'octane/compiler/vite';
import { renderToString } from 'octane/server';
import { loadServerFixture } from '../../_server-fixture';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import type {} from './main';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, '../../_fixtures/form-action-data.tsrx');
let browser: Browser;
let page: Page | undefined;
let pageFailures: string[] = [];

beforeAll(async () => {
	browser = await launchBrowser({ headless: true });
});

afterEach(async () => {
	if (page) {
		try {
			if (await page.evaluate(() => Boolean(window.__formActions))) {
				await page.evaluate(() => window.__formActions.release());
				await page.waitForFunction(() => window.__formActions.state().status === 'idle');
				await page.evaluate(() => window.__formActions.unmount());
			}
		} finally {
			await page.close();
			page = undefined;
		}
	}
	const failures = pageFailures;
	pageFailures = [];
	expect(failures).toEqual([]);
});

afterAll(async () => {
	await browser?.close();
});

describe.sequential.each(['development', 'production'] as const)('%s form actions', (buildMode) => {
	let server: ViteDevServer | PreviewServer | undefined;
	let outDir: string | undefined;
	let baseUrl: string;

	beforeAll(async () => {
		const fixture =
			loadServerFixture<typeof import('../../_fixtures/form-action-data.tsrx')>(FIXTURE);
		const serverHtml = renderToString(fixture.FormActionData, {}).html;
		const shell: Plugin = {
			name: 'form-actions-server-html',
			transformIndexHtml(html) {
				return html.replace('<!-- form-content -->', serverHtml);
			},
		};
		const config = {
			configFile: false as const,
			root: HERE,
			logLevel: 'error' as const,
			cacheDir: resolve(HERE, '../../../../../node_modules/.vite/octane-form-actions'),
			plugins: [shell, octane()],
		};
		if (buildMode === 'development') {
			server = await createServer({
				...config,
				server: { host: '127.0.0.1', port: 0, watch: null },
			});
			await server.listen();
		} else {
			outDir = mkdtempSync(join(tmpdir(), 'octane-form-actions-'));
			await build({ ...config, build: { outDir, emptyOutDir: true } });
			server = await preview({
				configFile: false,
				root: HERE,
				logLevel: 'error',
				build: { outDir },
				preview: { host: '127.0.0.1', port: 0 },
			});
		}
		const address = server.httpServer!.address();
		if (!address || typeof address === 'string') throw new Error('No Vite TCP port');
		baseUrl = `http://127.0.0.1:${address.port}`;
	});

	afterAll(async () => {
		if (buildMode === 'development') {
			await (server as ViteDevServer | undefined)?.close();
		} else if (server) {
			await new Promise<void>((resolve, reject) => {
				server!.httpServer!.close((error) => (error ? reject(error) : resolve()));
			});
		}
		if (outDir) rmSync(outDir, { recursive: true, force: true });
	});

	for (const renderMode of ['mount', 'hydrate'] as const) {
		for (const manual of [false, true]) {
			it.each([
				['before', ['publish', 'draft', 'fallback']],
				['middle', ['draft', 'preview', 'fallback']],
				['after', ['draft', 'fallback', 'archive']],
				['no submitter', ['draft', 'fallback']],
			] as const)(
				`${renderMode}: ${manual ? 'manual transition' : 'action'} preserves %s submission data`,
				async (position, values) => {
					page = await browser.newPage();
					page.on('pageerror', (error) => pageFailures.push(error.message));
					page.on('console', (message) => {
						if (message.type() === 'warning' || message.type() === 'error')
							pageFailures.push(message.text());
					});
					await page.goto(baseUrl);
					await page.waitForFunction(() => Boolean(window.__formActions));
					await page.evaluate(
						({ renderMode, manual }) => window.__formActions.mount(renderMode, manual),
						{ renderMode, manual },
					);
					if (renderMode === 'hydrate')
						expect((await page.evaluate(() => window.__formActions.state())).adopted).toBe(true);
					const native = await page.evaluate((position) => {
						const form = document.querySelector('form')!;
						const submitter =
							position === 'no submitter' ? null : document.getElementById(position);
						const data = new FormData(form, submitter);
						return {
							first: data.get('intent'),
							values: data.getAll('intent'),
							entries: Array.from(data.entries()),
						};
					}, position);
					expect(native.values).toEqual(values);
					await page.evaluate(() => window.__formActions.observe());
					if (position === 'no submitter') {
						await page.evaluate(() => document.querySelector('form')!.requestSubmit());
					} else {
						await page.locator('#' + position).click();
					}
					await page.waitForFunction(() => window.__formActions.state().status !== 'idle');
					const state = await page.evaluate(() => window.__formActions.state());
					if (!manual) {
						expect(state.first).toBe(native.first);
						expect(state.values).toEqual(values);
						expect(state.entries).toEqual(native.entries);
					}
					expect(JSON.parse(state.status!)).toEqual(native.entries);
					expect(state.observed).toEqual(native.entries);
					await page.evaluate(() => window.__formActions.release());
					await page.waitForFunction(() => window.__formActions.state().status === 'idle');
				},
			);
		}
	}
});
