import { mkdtemp, rm } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build, preview, type PreviewServer } from 'vite';

import { browserName, launchBrowser } from '../../../../test-utils/playwright-browser.js';
import { octane } from '../../../octane/src/compiler/vite.js';
import { renderHydrationFixture } from '../../../octane/tests/_hydration-ssr.js';

const testRoot = dirname(fileURLToPath(import.meta.url));
const harnessRoot = resolve(testRoot, 'harness');
const repositoryRoot = resolve(testRoot, '../../../..');

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

let server: PreviewServer;
let outputRoot = '';
let origin = '';

beforeAll(async () => {
	const port = await getFreePort();
	outputRoot = await mkdtemp(join(tmpdir(), 'octane-react-pdf-binding-'));
	const hydration = await renderHydrationFixture(
		'pdf',
		'packages/pdf/tests/browser/harness/hydration.tsrx',
		'PdfHydrationFixture',
	);
	await build({
		configFile: false,
		root: harnessRoot,
		logLevel: 'error',
		plugins: [
			{
				name: 'octane-pdf-browser-hydration-shell',
				transformIndexHtml(source) {
					const marker = '<!--octane-pdf-hydration-shell-->';
					if (!source.includes(marker)) {
						throw new Error(`Missing ${marker} in the PDF browser harness`);
					}
					return source.replace(marker, hydration.html);
				},
			},
			octane(),
		],
		resolve: {
			alias: [
				{
					find: /^octane$/,
					replacement: resolve(repositoryRoot, 'packages/octane/src/index.ts'),
				},
				{
					find: /^@octanejs\/pdf$/,
					replacement: resolve(repositoryRoot, 'packages/pdf/src/index.ts'),
				},
			],
		},
		build: { outDir: outputRoot, emptyOutDir: true },
	});
	server = await preview({
		configFile: false,
		root: harnessRoot,
		logLevel: 'error',
		build: { outDir: outputRoot },
		preview: { host: '127.0.0.1', port, strictPort: true },
	});
	origin = `http://127.0.0.1:${port}`;
}, 60_000);

afterAll(async () => {
	await server?.close().catch(() => {});
	if (outputRoot) await rm(outputRoot, { recursive: true, force: true });
});

async function runBindingCase() {
	const browser = await launchBrowser({ headless: true });
	const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
	const page = await context.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));

	try {
		await page.goto(origin, { waitUntil: 'domcontentloaded' });
		try {
			await expect
				.poll(() => page.locator('#binding-probe').getAttribute('data-status'), { timeout: 15_000 })
				.toBe('ready');
			await expect
				.poll(() => page.locator('#react-parity-probe').getAttribute('data-status'), {
					timeout: 15_000,
				})
				.toBe('ready');
		} catch (error) {
			const snapshot = await page.evaluate(() => ({
				attributes: Object.fromEntries(
					Array.from(document.querySelector('#binding-probe')?.attributes ?? []).map(
						(attribute) => [attribute.name, attribute.value],
					),
				),
				markup: document.querySelector('#binding-probe')?.innerHTML,
			}));
			throw new Error(`${String(error)}\n${JSON.stringify({ errors, snapshot }, null, 2)}`);
		}
		expect(
			Number(await page.locator('#binding-probe').getAttribute('data-worker-count')),
		).toBeGreaterThan(0);
		expect(
			await page
				.locator('#binding-probe .react-pdf__Page .react-pdf__Page__canvas')
				.first()
				.getAttribute('width'),
		).toBe('300');
		expect(
			await page.locator('#binding-probe .react-pdf__Page .textLayer').first().textContent(),
		).toContain('Octane PDF probe');
		expect(
			await page.locator('#binding-probe .react-pdf__Page .annotationLayer a').getAttribute('href'),
		).toBe('https://octanejs.com/');
		expect(await page.locator('.react-pdf__Outline').textContent()).toContain('Probe page');
		expect(await page.locator('.react-pdf__Thumbnail__page canvas').count()).toBe(1);
		expect(
			await page.locator('#binding-probe .react-pdf__Page__canvas').first().getAttribute('width'),
		).toBe(
			await page.locator('#react-parity-probe .react-pdf__Page__canvas').getAttribute('width'),
		);
		expect(await page.locator('#binding-probe .textLayer').first().textContent()).toBe(
			await page.locator('#react-parity-probe .textLayer').textContent(),
		);
		expect(await page.locator('#binding-probe .annotationLayer a').getAttribute('href')).toBe(
			await page.locator('#react-parity-probe .annotationLayer a').getAttribute('href'),
		);
		for (const attribute of [
			'data-document-ready',
			'data-canvas-ready',
			'data-text-ready',
			'data-annotations-ready',
		]) {
			expect(await page.locator('#binding-probe').getAttribute(attribute)).toBe(
				await page.locator('#react-parity-probe').getAttribute(attribute),
			);
		}
		await expect
			.poll(() => page.locator('#hydration-root').getAttribute('data-ready'))
			.toBe('true');
		expect(await page.locator('#hydration-root').getAttribute('data-node-preserved')).toBe('true');
		expect(await page.locator('#hydration-root canvas').getAttribute('width')).toBe('120');
		await expect
			.poll(() => page.locator('#binding-probe').getAttribute('data-load-error'))
			.toBe('InvalidPDFException');
		expect(await page.locator('#binding-probe .react-pdf__message--error').textContent()).toBe(
			'Invalid PDF',
		);
		await page.locator('.react-pdf__Page').first().dispatchEvent('mousemove');
		await expect
			.poll(() => page.locator('#binding-probe').getAttribute('data-page-event-value'))
			.toBe('1');
		await page.locator('.react-pdf__Outline').dispatchEvent('mousemove');
		await expect
			.poll(() => page.locator('#binding-probe').getAttribute('data-document-event-value'))
			.toBe('1');
		await expect
			.poll(() => page.locator('#binding-probe').getAttribute('data-outline-event-value'))
			.toBe('1');

		await page.click('.react-pdf__Outline a');
		await expect
			.poll(() => page.locator('#binding-probe').getAttribute('data-item-click'))
			.toBe('0:1');
		await page.click('.react-pdf__Thumbnail');
		await expect
			.poll(() => page.locator('#binding-probe').getAttribute('data-thumbnail-click'))
			.toBe('0:1');

		const customLayer = page.locator('#binding-probe .react-pdf__Page .textLayer').nth(1);
		expect(await customLayer.locator('strong').getAttribute('data-safe')).toBe('yes');
		expect(await customLayer.locator('strong').getAttribute('onclick')).toBeNull();
		expect(await customLayer.locator('script').count()).toBe(0);
		expect(await customLayer.locator('a').getAttribute('href')).toBeNull();
		expect(
			await page.evaluate(() => (window as never as { __unsafe?: number }).__unsafe),
		).toBeUndefined();

		await page.click('#resize-binding');
		await expect
			.poll(() =>
				page.locator('#binding-probe .react-pdf__Page__canvas').first().getAttribute('width'),
			)
			.toBe('200');

		await page.click('#unmount-binding');
		await expect.poll(() => page.locator('#binding-probe .react-pdf__Page').count()).toBe(0);
		await expect
			.poll(async () =>
				Number(await page.locator('#binding-probe').getAttribute('data-worker-terminations')),
			)
			.toBeGreaterThan(0);
		expect(errors).toEqual([]);
	} finally {
		await context.close();
		await browser.close();
	}
}

describe('@octanejs/pdf browser contract', () => {
	// @parity-case browser:react-pdf-selected
	it(`renders the binding in ${browserName}`, () => runBindingCase(), 90_000);
});
