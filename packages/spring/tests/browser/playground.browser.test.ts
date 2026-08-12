import { createServer as createNetServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build, createServer, preview, type PreviewServer, type ViteDevServer } from 'vite';

import { octane } from '../../../octane/src/compiler/vite.js';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const harnessRoot = resolve(import.meta.dirname, 'harness');
const springSource = resolve(repositoryRoot, 'packages/spring/src');

function viteConfig() {
	return {
		configFile: false as const,
		root: harnessRoot,
		logLevel: 'error' as const,
		plugins: [octane()],
		resolve: {
			alias: [
				{
					find: /^octane$/,
					replacement: resolve(repositoryRoot, 'packages/octane/src/index.ts'),
				},
				{ find: /^@octanejs\/spring$/, replacement: resolve(springSource, 'index.ts') },
				{
					find: /^@octanejs\/spring\/parallax$/,
					replacement: resolve(springSource, 'parallax.ts'),
				},
			],
		},
	};
}

function getFreePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const server = createNetServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address() as import('node:net').AddressInfo;
			server.close(() => resolvePort(port));
		});
	});
}

let browser: import('playwright').Browser;
let devServer: ViteDevServer;
let productionServer: PreviewServer;
let developmentOrigin = '';
let productionOrigin = '';
let productionDirectory = '';

beforeAll(async () => {
	try {
		const { chromium } = await import('playwright');
		browser = await chromium.launch({ headless: true });
	} catch (error) {
		throw new Error(
			'[@octanejs/spring browser] Chromium is required ' +
				'(run `pnpm exec playwright install chromium`): ' +
				(error instanceof Error ? error.message.split('\n')[0] : String(error)),
		);
	}

	const developmentPort = await getFreePort();
	devServer = await createServer({
		...viteConfig(),
		server: { host: '127.0.0.1', port: developmentPort, strictPort: true },
	});
	await devServer.listen();
	developmentOrigin = `http://127.0.0.1:${developmentPort}`;

	productionDirectory = await mkdtemp(resolve(tmpdir(), 'octane-react-spring-playground-'));
	await build({
		...viteConfig(),
		build: { outDir: productionDirectory, emptyOutDir: true },
	});
	const productionPort = await getFreePort();
	productionServer = await preview({
		configFile: false,
		root: harnessRoot,
		logLevel: 'error',
		build: { outDir: productionDirectory },
		preview: { host: '127.0.0.1', port: productionPort, strictPort: true },
	});
	productionOrigin = `http://127.0.0.1:${productionPort}`;
});

afterAll(async () => {
	await productionServer?.httpServer.close();
	await devServer?.close();
	await browser?.close();
	if (productionDirectory) await rm(productionDirectory, { recursive: true, force: true });
});

async function exercise(origin: string): Promise<void> {
	const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	try {
		await page.goto(`${origin}/#/react-spring`, { waitUntil: 'domcontentloaded' });
		await page.locator('#spring-dot').waitFor();
		await page.locator('#spring-interrupt').click();
		await expect
			.poll(() =>
				page.locator('#spring-dot').evaluate((node) => parseFloat(getComputedStyle(node).left)),
			)
			.toBeGreaterThan(190);

		await page.locator('#spring-transition').click();
		await expect.poll(() => page.locator('#spring-items').textContent()).toContain('Gamma');
		await expect.poll(() => page.locator('#spring-items').textContent()).not.toContain('Alpha');

		const parallax = page.locator('.react-spring-parallax > div').first();
		await parallax.evaluate((node) => {
			node.scrollTop = node.clientHeight;
			node.dispatchEvent(new Event('scroll'));
		});
		await expect
			.poll(() =>
				page
					.locator('.react-spring-page')
					.nth(1)
					.evaluate((node) => getComputedStyle(node.parentElement!).transform),
			)
			.not.toBe('matrix(1, 0, 0, 1, 0, 0)');

		await page.evaluate(() => {
			window.location.hash = '#/counter';
		});
		await page.locator('#spring-dot').waitFor({ state: 'detached' });
		await page.waitForTimeout(100);
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
}

describe('React Spring playground browser evidence', () => {
	// Per targets/web/src/animated.test.tsx:50
	it('animates, interrupts, transitions, scrolls, and cleans up in development', async () => {
		await exercise(developmentOrigin);
	});

	// Per targets/web/src/animated.test.tsx:50
	it('repeats the core journey against the production build', async () => {
		await exercise(productionOrigin);
	});

	// Per packages/shared/src/hooks/useReducedMotion.test.ts:29
	it('honors reduced motion in the live playground', async () => {
		const page = await browser.newPage();
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto(`${developmentOrigin}/#/react-spring`, { waitUntil: 'domcontentloaded' });
		await expect
			.poll(() => page.locator('#spring-motion-preference').textContent())
			.toBe('Reduced motion');
		await page.locator('#spring-interrupt').click();
		await expect
			.poll(() =>
				page.locator('#spring-dot').evaluate((node) => parseFloat(getComputedStyle(node).left)),
			)
			.toBeGreaterThan(190);
		await page.close();
	});
});
