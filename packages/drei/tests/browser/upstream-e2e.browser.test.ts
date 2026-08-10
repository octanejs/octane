import { readFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from '../../../octane/src/compiler/vite.js';
import { threeRenderers } from '../../../three/src/config.ts';

const testDir = dirname(fileURLToPath(import.meta.url));
const harnessRoot = resolve(testDir, 'e2e');
const repoRoot = resolve(testDir, '../../../..');
const oraclePath = resolve(
	testDir,
	'../../upstream/test/e2e/snapshot.test.ts-snapshots/should-match-previous-one-1-linux.png',
);
const MAX_DIFF_RATIO = 0.02;

let viteServer: ViteDevServer;
let origin = '';
let browser: import('playwright').Browser;

function getFreePort(): Promise<number> {
	return new Promise(function (resolvePort, reject) {
		const server = createNetServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', function () {
			const { port } = server.address() as import('node:net').AddressInfo;
			server.close(function () {
				resolvePort(port);
			});
		});
	});
}

async function comparePngToOracle(
	page: import('playwright').Page,
	actualPng: Buffer,
	expectedPng: Buffer,
): Promise<{ ok: boolean; diffRatio: number; width: number; height: number; reason?: string }> {
	return page.evaluate(
		async function (payload) {
			async function decode(dataUrl: string) {
				const image = new Image();
				image.src = dataUrl;
				await image.decode();
				const canvas = document.createElement('canvas');
				canvas.width = image.width;
				canvas.height = image.height;
				const context = canvas.getContext('2d');
				if (!context) throw new Error('2d context unavailable');
				context.drawImage(image, 0, 0);
				return context.getImageData(0, 0, image.width, image.height);
			}
			const actual = await decode(payload.actualDataUrl);
			const expected = await decode(payload.expectedDataUrl);
			if (actual.width !== expected.width || actual.height !== expected.height) {
				return {
					ok: false,
					diffRatio: 1,
					width: actual.width,
					height: actual.height,
					reason: `size ${actual.width}x${actual.height} != ${expected.width}x${expected.height}`,
				};
			}
			let differingBytes = 0;
			for (let index = 0; index < actual.data.length; index++) {
				if (actual.data[index] !== expected.data[index]) differingBytes += 1;
			}
			const diffRatio = differingBytes / actual.data.length;
			return {
				ok: diffRatio <= payload.maxDiffRatio,
				diffRatio,
				width: actual.width,
				height: actual.height,
			};
		},
		{
			actualDataUrl: `data:image/png;base64,${actualPng.toString('base64')}`,
			expectedDataUrl: `data:image/png;base64,${expectedPng.toString('base64')}`,
			maxDiffRatio: MAX_DIFF_RATIO,
		},
	);
}

beforeAll(async function () {
	const { chromium } = await import('playwright');
	browser = await chromium.launch({ headless: true });
	const port = await getFreePort();
	viteServer = await createServer({
		root: repoRoot,
		configFile: false,
		logLevel: 'error',
		server: { port, host: '127.0.0.1', strictPort: true },
		plugins: [
			octane({
				renderers: {
					...threeRenderers,
					boundaries: {
						...threeRenderers.boundaries,
						'@octanejs/drei': {
							Html: { ownerRenderer: 'three', childRenderer: 'dom', prop: 'children' },
						},
					},
				},
			}),
		],
		resolve: {
			alias: [
				{
					find: /^@octanejs\/three$/,
					replacement: resolve(testDir, '../../../three/src/index.ts'),
				},
				{
					find: /^@octanejs\/three\/core$/,
					replacement: resolve(testDir, '../../../three/src/core/index.ts'),
				},
				{
					find: /^@octanejs\/three\/renderer$/,
					replacement: resolve(testDir, '../../../three/src/renderer.ts'),
				},
				{
					find: /^@octanejs\/three\/config$/,
					replacement: resolve(testDir, '../../../three/src/config.ts'),
				},
				{
					find: /^@octanejs\/three\/testing$/,
					replacement: resolve(testDir, '../../../three/src/testing.ts'),
				},
				{
					find: /^@octanejs\/three\/intrinsics(?:\/jsx-runtime)?$/,
					replacement: resolve(testDir, '../../../three/src/intrinsics.ts'),
				},
				{
					find: /^@octanejs\/drei$/,
					replacement: resolve(testDir, '../../src/index.ts'),
				},
				{
					find: /^octane$/,
					replacement: resolve(testDir, '../../../octane/src/index.ts'),
				},
				{
					find: /^octane\/universal$/,
					replacement: resolve(testDir, '../../../octane/src/universal.ts'),
				},
				{
					find: /^octane\/server$/,
					replacement: resolve(testDir, '../../../octane/src/server/index.ts'),
				},
			],
			dedupe: ['three'],
		},
	});
	await viteServer.listen();
	origin = `http://127.0.0.1:${port}/packages/drei/tests/browser/e2e/index.html`;
}, 60_000);

afterAll(async function () {
	await browser?.close();
	await viteServer?.close();
});

describe('adapted Drei e2e screenshot (Playwright)', function () {
	// @parity-case adapted:e2e-snapshot
	it('should match previous one', async function () {
		const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
		let pageError = '';
		page.on('pageerror', function capturePageError(error) {
			pageError = error.message;
		});
		await page.addInitScript(function captureDreiReadyEvent() {
			const dispatchEvent = document.dispatchEvent.bind(document);
			document.dispatchEvent = function trackDreiReadyEvent(event: Event): boolean {
				if (event.type === 'playright:r3f') {
					(globalThis as typeof globalThis & { __dreiE2eEvent?: boolean }).__dreiE2eEvent = true;
				}
				return dispatchEvent(event);
			};
		});
		await page.goto(origin, { waitUntil: 'networkidle' });
		const canvas = page.locator('canvas');
		expect(pageError).toBe('');
		expect(await canvas.count()).toBe(1);
		await page.waitForFunction(function () {
			return Boolean(
				(globalThis as typeof globalThis & { __dreiE2eEvent?: boolean }).__dreiE2eEvent,
			);
		});
		expect((await canvas.boundingBox())?.width).toBe(300);
		expect((await canvas.boundingBox())?.height).toBe(150);

		const actual = await canvas.screenshot({ type: 'png' });
		const expected = readFileSync(oraclePath);
		const comparison = await comparePngToOracle(page, actual, expected);
		expect(comparison.reason, JSON.stringify(comparison)).toBeUndefined();
		expect(comparison.diffRatio, JSON.stringify(comparison)).toBeLessThanOrEqual(MAX_DIFF_RATIO);
		expect(comparison.ok, JSON.stringify(comparison)).toBe(true);
		await page.close();
	});
});
