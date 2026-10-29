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

function fixtureConfig(): UserConfig {
	return {
		configFile: false,
		root: HERE,
		logLevel: 'error',
		plugins: [octane({ requireDirective: true })],
	};
}

beforeAll(async () => {
	buildDirectory = await mkdtemp(join(tmpdir(), 'octane-react-hosted-layout-'));
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
	browser = await launchBrowser({ headless: true });
});

afterAll(async () => {
	await page?.close();
	await browser?.close();
	await server?.close();
	if (buildDirectory) await rm(buildDirectory, { recursive: true, force: true });
});

// octanejs/octane#2305: the OctaneCompat host must not add a layout box, so a
// hosted island's root element sizes in a flex row as it would unhosted.
describe('OctaneCompat host layout in Chromium', () => {
	it('lets a hosted shrinkable flex item size like the same item rendered directly', async () => {
		const failures: string[] = [];
		page = await browser.newPage();
		page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
		page.on('console', (message) => {
			if (message.type() === 'error' || message.type() === 'warning') {
				failures.push(`${message.type()}: ${message.text()}`);
			}
		});
		await page.goto(baseUrl);
		await page.waitForSelector('#hosted .title');

		for (const wide of [false, true]) {
			await page.evaluate((next) => window.__hostedLayout.render(next), wide);
			const direct = await page.evaluate(() => window.__hostedLayout.measure('direct'));
			const hosted = await page.evaluate(() => window.__hostedLayout.measure('hosted'));
			expect(direct.titleWidth).toBe(320 - (wide ? 96 : 48));
			expect(hosted).toEqual(direct);
		}
		expect(await page.evaluate(() => window.__hostedLayout.hostDisplay())).toBe('contents');
		expect(failures).toEqual([]);
	});
});
