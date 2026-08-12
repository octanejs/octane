import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { build, preview, type PreviewServer, type UserConfig } from 'vite';
import { octane } from 'octane/compiler/vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

let server: PreviewServer;
let browser: Browser;
let page: Page;
let baseUrl: string;
let buildDirectory: string;
let servedHtml: string;

function fixtureConfig(): UserConfig {
	return {
		configFile: false,
		root: HERE,
		logLevel: 'error',
		plugins: [octane({ requireDirective: true })],
	};
}

beforeAll(async () => {
	buildDirectory = await mkdtemp(join(tmpdir(), 'octane-react-hosted-web3-'));
	await build({
		...fixtureConfig(),
		build: { outDir: buildDirectory, emptyOutDir: false },
	});
	server = await preview({
		...fixtureConfig(),
		build: { outDir: buildDirectory },
		preview: { host: '127.0.0.1', port: 0 },
	});
	const address = server.httpServer.address();
	if (!address || typeof address === 'string') throw new Error('Vite did not expose a TCP port');
	baseUrl = `http://127.0.0.1:${address.port}`;
	servedHtml = await fetch(baseUrl).then((response) => response.text());
	browser = await launchBrowser({ headless: true });
});

afterAll(async () => {
	await page?.close();
	await browser?.close();
	await server?.close();
	if (buildDirectory) await rm(buildDirectory, { recursive: true, force: true });
});

describe('incremental React-hosted Web3 browser journey', () => {
	it('builds the mixed React/TSRX graph and cleans up the connected island on navigation', async () => {
		expect(servedHtml).toMatch(
			/<script type="module" crossorigin src="\/assets\/[^"]+\.js"><\/script>/,
		);
		expect(servedHtml).not.toContain('/main.tsx');

		const failures: string[] = [];
		page = await browser.newPage();
		page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
		page.on('console', (message) => {
			if (message.type() === 'error' || message.type() === 'warning') {
				failures.push(`${message.type()}: ${message.text()}`);
			}
		});
		await page.goto(baseUrl);
		await page.waitForSelector('#island-status');
		await page.evaluate(() => window.__web3ReactHost.captureShell());
		expect(await page.locator('#island-route').textContent()).toBe('portfolio');

		await page.locator('.rk-connect-button').click();
		await page.waitForSelector('[role="dialog"]');
		expect(await page.locator('[role="dialog"]').count()).toBe(1);
		await page.locator('.rk-action').click();
		await page.waitForFunction(
			() => document.querySelector('#island-status')?.textContent === 'connected',
		);
		expect(await page.locator('#island-chain').textContent()).toBe('1');

		await page.evaluate(() => window.__web3ReactHost.navigate('activity'));
		await page.waitForFunction(
			() => document.querySelector('#island-route')?.textContent === 'activity',
		);
		expect(await page.evaluate(() => window.__web3ReactHost.shellSurvived())).toBe(true);

		const accountButton = page.locator('.rk-connect-button').filter({ hasText: '0x0000' });
		await accountButton.click();
		await page.waitForSelector('[role="dialog"]');
		expect(await page.locator('[role="dialog"]').count()).toBe(1);
		await page.evaluate(() => window.__web3ReactHost.removeIsland('settings'));
		await page.waitForSelector('#react-fallback');
		await page.waitForFunction(() => window.__web3ReactHost.observation().activeWatchers === 0);
		expect(await page.evaluate(() => window.__web3ReactHost.observation())).toEqual({
			activeWatchers: 0,
			cleanups: 1,
		});
		expect(await page.locator('[role="dialog"]').count()).toBe(0);
		expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
		expect(await page.evaluate(() => window.__web3ReactHost.shellSurvived())).toBe(true);
		expect(failures).toEqual([]);
	});
});
