import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { build, createServer, preview, type InlineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {} from './bridge.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = resolve(HERE, '../../..');
const requirePackage = createRequire(join(PACKAGE, 'package.json'));
let browser: Browser;

beforeAll(async () => {
	browser = await launchBrowser({ headless: true });
});

afterAll(async () => {
	await browser?.close();
});

function packageRoot(entry: string, name: string): string {
	let directory = dirname(entry);
	for (;;) {
		try {
			if (JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')).name === name) {
				return directory;
			}
		} catch {
			// A resolved entry can be nested below its package manifest.
		}
		const parent = dirname(directory);
		if (parent === directory) throw new Error('Missing manifest for ' + name);
		directory = parent;
	}
}

function appConfig(kind: 'native' | 'ordinary', scratch: string): InlineConfig {
	const manifest = JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8'));
	const alias = Object.entries(manifest.exports).flatMap(([key, value]) => {
		const target = typeof value === 'string' ? value : (value as { default?: string }).default;
		if (!target) return [];
		const name = key === '.' ? 'octane' : 'octane' + key.slice(1);
		return [
			{
				find: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'),
				replacement: resolve(PACKAGE, target),
			},
		];
	});
	// Resolve the actual package selected for Octane, including its browser ESM
	// entry. This also supports the explicitly recorded supplemental source lane.
	const alien = packageRoot(requirePackage.resolve('alien-signals/system'), 'alien-signals');
	const alienManifest = JSON.parse(readFileSync(join(alien, 'package.json'), 'utf8'));
	const devalue = requirePackage.resolve('devalue');
	alias.push(
		{
			find: /^alien-signals\/system$/,
			replacement: resolve(alien, alienManifest.exports['./system'].import),
		},
		{ find: /^alien-signals$/, replacement: resolve(alien, alienManifest.exports['.'].import) },
		{ find: /^devalue$/, replacement: devalue },
	);
	return {
		configFile: false,
		root: HERE,
		cacheDir: join(scratch, 'vite-cache'),
		logLevel: 'error',
		plugins: [octane({ nativeReads: kind === 'native' })],
		resolve: { alias },
		server: {
			host: '127.0.0.1',
			port: 0,
			fs: { allow: [resolve(PACKAGE, '../..'), alien, dirname(devalue)] },
		},
		preview: { host: '127.0.0.1', port: 0 },
		build: {
			outDir: join(scratch, 'dist'),
			emptyOutDir: true,
			rollupOptions: { input: resolve(HERE, kind + '.html') },
		},
	};
}

async function withApp(
	kind: 'native' | 'ordinary',
	mode: 'dev' | 'prod',
	check: (page: Page) => Promise<void>,
): Promise<void> {
	const scratch = await mkdtemp(join(tmpdir(), 'octane-native-browser-'));
	const config = appConfig(kind, scratch);
	let close: (() => Promise<void>) | undefined;
	let page: Page | undefined;
	const failures: string[] = [];
	try {
		let port: number;
		if (mode === 'dev') {
			const server = await createServer(config);
			close = () => server.close();
			await server.listen();
			const address = server.httpServer!.address();
			if (!address || typeof address === 'string') throw new Error('Missing development port');
			port = address.port;
		} else {
			await build(config);
			const server = await preview(config);
			close = () =>
				new Promise((done, reject) =>
					server.httpServer.close((error) => (error ? reject(error) : done())),
				);
			const address = server.httpServer.address();
			if (!address || typeof address === 'string') throw new Error('Missing preview port');
			port = address.port;
		}
		page = await browser.newPage();
		page.on('pageerror', (error) => failures.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') failures.push(message.text());
		});
		await page.goto(`http://127.0.0.1:${port}/${kind}.html`);
		try {
			await page.waitForFunction(() => Boolean(window.__nativeCollectionBrowser));
		} catch (cause) {
			throw new Error(failures.join('\n') || 'Browser fixture did not initialize', { cause });
		}
		expect(await page.evaluate(() => window.__nativeCollectionBrowser.mode)).toBe(kind);
		await check(page);
		expect(failures).toEqual([]);
	} finally {
		await page?.close();
		await close?.();
	}
}

async function expectText(page: Page, selector: string, text: string): Promise<void> {
	await expect.poll(() => page.locator(selector).textContent()).toBe(text);
}

async function preserveInputAcrossParentUpdate(page: Page): Promise<void> {
	await page.locator('#draft').fill('browser draft');
	await page.locator('#draft').focus();
	await page.evaluate(() => {
		const input = document.querySelector<HTMLInputElement>('#draft')!;
		input.setSelectionRange(1, 5);
		window.__nativeCollectionBrowser.rememberInput();
		window.__nativeCollectionBrowser.rename('renamed');
	});
	expect(
		await page.evaluate(() => {
			const input = document.querySelector<HTMLInputElement>('#draft')!;
			return {
				same: window.__nativeCollectionBrowser.inputIsSame(),
				value: input.value,
				focused: document.activeElement === input,
				selection: [input.selectionStart, input.selectionEnd],
			};
		}),
	).toEqual({ same: true, value: 'browser draft', focused: true, selection: [1, 5] });
	await expectText(page, '#label', 'renamed');
}

describe.sequential('compiled native collection in a real browser', () => {
	for (const mode of ['dev', 'prod'] as const) {
		it(`keeps native reads current through memo reuse and reader retirement (${mode})`, async () => {
			await withApp('native', mode, async (page) => {
				await expectText(page, '#memo', '0');
				await expectText(page, '#fixed', '0');
				await expectText(page, '#defaults', '0:0');
				await expectText(page, '#indirect', '0');
				await preserveInputAcrossParentUpdate(page);
				await page.getByRole('button', { name: 'Increment' }).click();
				await expectText(page, '#memo', '2');
				await expectText(page, '#fixed', '0');
				await expectText(page, '#defaults', '1:1');
				await expectText(page, '#indirect', '1');
				await page.evaluate(() => {
					const bridge = window.__nativeCollectionBrowser;
					if (bridge.mode !== 'native') throw new Error('Expected native fixture');
					bridge.showReaders(false);
					bridge.setSignal(4);
				});
				expect(await page.locator('#readers').count()).toBe(0);
				await page.evaluate(() => {
					const bridge = window.__nativeCollectionBrowser;
					if (bridge.mode !== 'native') throw new Error('Expected native fixture');
					bridge.showReaders(true);
				});
				await expectText(page, '#memo', '8');
				await expectText(page, '#fixed', '4');
				await expectText(page, '#defaults', '4:4');
				await expectText(page, '#indirect', '4');
				expect(
					await page.evaluate(() => {
						const bridge = window.__nativeCollectionBrowser;
						if (bridge.mode !== 'native') throw new Error('Expected native fixture');
						bridge.unmount();
						bridge.setSignal(5);
						const value = bridge.read$();
						bridge.disposeData();
						return { value, empty: document.querySelector('#app')!.textContent === '' };
					}),
				).toEqual({ value: 5, empty: true });
			});
		});

		it(`preserves ordinary hook state and browser input without native reads (${mode})`, async () => {
			await withApp('ordinary', mode, async (page) => {
				await page.getByRole('button', { name: 'Increment' }).click();
				await expectText(page, '#ordinary', '1');
				await preserveInputAcrossParentUpdate(page);
				await expectText(page, '#ordinary', '1');
				await page.getByRole('button', { name: 'Increment' }).click();
				await expectText(page, '#ordinary', '2');
				await page.evaluate(() => window.__nativeCollectionBrowser.unmount());
				expect(await page.locator('#app').textContent()).toBe('');
			});
		});
	}
});
