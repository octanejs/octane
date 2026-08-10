import { mkdtemp, rm } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build, preview, type PreviewServer } from 'vite';
import { octane } from '../../../octane/src/compiler/vite.js';

const testRoot = dirname(fileURLToPath(import.meta.url));
const harnessRoot = resolve(testRoot, 'harness');
const octaneSource = resolve(testRoot, '../../../octane/src/index.ts');

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

let viteServer: PreviewServer;
let outputRoot = '';
let origin = '';

beforeAll(async () => {
	const port = await getFreePort();
	outputRoot = await mkdtemp(join(tmpdir(), 'octane-react-pdf-feasibility-'));
	await build({
		configFile: false,
		root: harnessRoot,
		logLevel: 'error',
		plugins: [octane()],
		resolve: { alias: [{ find: /^octane$/, replacement: octaneSource }] },
		build: { outDir: outputRoot, emptyOutDir: true },
	});
	viteServer = await preview({
		configFile: false,
		root: harnessRoot,
		logLevel: 'error',
		build: { outDir: outputRoot },
		preview: { host: '127.0.0.1', port, strictPort: true },
	});
	origin = `http://127.0.0.1:${port}`;
}, 60_000);

afterAll(async () => {
	await viteServer?.close().catch(() => {});
	if (outputRoot) await rm(outputRoot, { recursive: true, force: true });
});

async function runBrowserCase(engine: 'chromium' | 'firefox') {
	const playwright = await import('playwright');
	const browser = await playwright[engine].launch({ headless: true });
	const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
	const page = await context.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	try {
		await page.goto(origin, { waitUntil: 'networkidle' });
		await expect.poll(() => page.locator('#probe').getAttribute('data-status')).toBe('ready');
		expect(await page.locator('#probe').getAttribute('data-worker')).toBe('true');
		expect(await page.locator('#probe').getAttribute('data-outline')).toBe('Probe page');
		expect(await page.locator('#page-canvas').getAttribute('width')).toBe('450');
		expect(await page.locator('#page-canvas').getAttribute('height')).toBe('300');
		expect(await page.locator('#text-layer').textContent()).toContain('Octane PDF probe');
		expect(await page.locator('#annotation-layer a').getAttribute('href')).toBe(
			'https://octanejs.com/',
		);
		await page.click('#toggle');
		await expect.poll(() => page.locator('#probe').count()).toBe(0);
		await expect.poll(() => page.evaluate(() => window.__reactPdfProbeCleanup)).toBe(true);
		expect(errors).toEqual([]);
	} finally {
		await context.close();
		await browser.close();
	}
}

describe('react-pdf U1 — real PDF.js browser feasibility', () => {
	// @parity-case browser:react-pdf-feasibility-chromium
	it(
		'Chromium loads a worker and renders canvas, text, annotations, outline, and cleanup',
		() => runBrowserCase('chromium'),
		90_000,
	);
	// @parity-case browser:react-pdf-feasibility-firefox
	it(
		'Firefox loads a worker and renders canvas, text, annotations, outline, and cleanup',
		() => runBrowserCase('firefox'),
		90_000,
	);
});
