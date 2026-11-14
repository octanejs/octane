import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { build, createServer, preview, type PreviewServer } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { octane } from '../../../octane/src/compiler/vite.js';

const root = resolve(import.meta.dirname, 'harness');
const octaneSource = resolve(import.meta.dirname, '../../../octane/src');
const alias = (target: string) => [
	{ find: /^octane$/, replacement: resolve(octaneSource, target) },
];

let browser: Browser;
let server: PreviewServer;
let directory: string;
let origin: string;
let markup: (native: boolean) => string;

beforeAll(async () => {
	browser = await chromium.launch({ headless: true });
	directory = await mkdtemp(resolve(tmpdir(), 'octane-lottie-browser-'));
	const common = { configFile: false as const, root, logLevel: 'error' as const };
	const ssr = await createServer({
		...common,
		plugins: [octane({ ssr: true })],
		resolve: { alias: alias('server/index.ts') },
		server: { middlewareMode: true },
	});
	try {
		({ markup } = await ssr.ssrLoadModule('/server.ts'));
	} finally {
		await ssr.close();
	}
	await build({
		...common,
		plugins: [octane()],
		resolve: { alias: alias('index.ts'), dedupe: ['lottie-web', 'react', 'react-dom'] },
		build: { outDir: directory },
	});
	server = await preview({
		...common,
		build: { outDir: directory },
		preview: { host: '127.0.0.1', port: 0, strictPort: true },
	});
	origin = server.resolvedUrls!.local[0];
});

afterAll(async () => {
	await browser?.close();
	if (server) await new Promise<void>((done) => server.httpServer.close(() => done()));
	if (directory) await rm(directory, { recursive: true, force: true });
});

async function run(native: boolean, hydrate: boolean) {
	const page = await browser.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (entry) => {
		if (entry.type() === 'error') errors.push(entry.text());
	});
	try {
		if (hydrate) {
			const html = markup(native);
			await page.route(
				(url) => url.pathname === '/',
				async (route) => {
					const response = await route.fetch();
					const body = (await response.text()).replace(
						'<div id="root"></div>',
						() => `<div id="root">${html}</div>`,
					);
					await route.fulfill({ response, body });
				},
			);
		}
		await page.goto(`${origin}?renderer=${native ? 'octane' : 'react'}`);
		const snapshot = () => page.evaluate(() => globalThis.snapshot());
		const initial = {
			svg: 1,
			loaded: true,
			adopted: true,
			registered: 1,
			destroys: 0,
			hasRef: true,
		};
		await expect.poll(snapshot).toEqual(initial);
		const frame = await page.evaluate(() => globalThis.replaceAnimation());
		await expect
			.poll(() => page.evaluate(() => globalThis.replacement()))
			.toEqual({
				replaced: true,
				loaded: true,
				frame: 6,
				destroys: 1,
			});
		await page.evaluate(() => globalThis.unmount());
		await expect.poll(snapshot).toMatchObject({
			svg: 0,
			registered: 0,
			destroys: 1,
			hasRef: true,
		});
		expect(errors).toEqual([]);
		return frame;
	} finally {
		await page.close();
	}
}

it.each([false, true])(
	'matches real animation playback and teardown (hydrate=%s)',
	async (hydrate) => {
		const original = await run(false, hydrate);
		expect(original).toBe(5);
		expect(await run(true, hydrate)).toBe(original);
	},
);
