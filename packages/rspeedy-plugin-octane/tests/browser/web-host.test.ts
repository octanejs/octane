// @vitest-environment node

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { createRspeedy } from '@lynx-js/rspeedy';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';

import { pluginOctane } from '../../src/index.js';

const DEMO_ROOT = resolve(import.meta.dirname, '../../examples/demo');
const MAIN_THREAD_FLUSH_ROOT = resolve(import.meta.dirname, '../_fixtures/main-thread-flush');
const WEB_CORE_ROOT = resolve(
	dirname(fileURLToPath(import.meta.resolve('@lynx-js/web-core/package.json'))),
	'dist/client_prod',
);

const CONTENT_TYPES: Record<string, string> = {
	'.bundle': 'application/octet-stream',
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.wasm': 'application/wasm',
};

const HOST_HTML = `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<link rel="stylesheet" href="/static/css/client.css" />
		<script type="module" src="/static/js/client.js"></script>
		<style>
			html, body, lynx-view { display: block; height: 100%; margin: 0; width: 100%; }
		</style>
	</head>
	<body>
		<lynx-view id="octane-demo"></lynx-view>
		<script>
			window.__lynxHostErrors = [];
			const view = document.getElementById('octane-demo');
			view.addEventListener('error', (event) => {
				window.__lynxHostErrors.push(String(event.detail?.message ?? event.detail ?? event.type));
			});
			view.setAttribute('url', '/main.web.bundle');
		</script>
	</body>
</html>`;

function isWithin(directory: string, target: string): boolean {
	const path = relative(directory, target);
	return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

async function startHost(bundlePath: string): Promise<{
	url: string;
	close: () => Promise<void>;
}> {
	const server = createServer(async (request, response) => {
		try {
			const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
			if (pathname === '/') {
				response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.html'] });
				response.end(HOST_HTML);
				return;
			}

			const file =
				pathname === '/main.web.bundle'
					? bundlePath
					: pathname.startsWith('/static/')
						? resolve(WEB_CORE_ROOT, pathname.slice(1))
						: undefined;
			if (file === undefined || (file !== bundlePath && !isWithin(WEB_CORE_ROOT, file))) {
				response.writeHead(404).end('Not found');
				return;
			}

			response.writeHead(200, {
				'Access-Control-Allow-Origin': '*',
				'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
			});
			response.end(await readFile(file));
		} catch (error) {
			response.writeHead(500).end(error instanceof Error ? error.message : String(error));
		}
	});

	await new Promise<void>((resolveListen, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolveListen);
	});
	const address = server.address();
	if (address === null || typeof address === 'string') {
		server.close();
		throw new Error('Could not bind the Lynx Web host.');
	}

	return {
		url: `http://127.0.0.1:${address.port}/`,
		close: () =>
			new Promise<void>((resolveClose, reject) => {
				server.close((error) => {
					if (error) reject(error);
					else resolveClose();
				});
			}),
	};
}

async function buildWebBundle(cwd: string, outputRoot: string): Promise<void> {
	const rspeedy = await createRspeedy({
		cwd,
		loadEnv: false,
		environment: ['web'],
		rspeedyConfig: {
			mode: 'production',
			environments: { web: {} },
			dev: { hmr: false, liveReload: false },
			output: {
				cleanDistPath: true,
				distPath: { root: outputRoot },
				filenameHash: false,
				sourceMap: false,
			},
			source: { entry: { main: './src/index.ts' } },
			splitChunks: false,
			plugins: [pluginOctane({ dev: false, hmr: false })],
		},
	});
	let build: Awaited<ReturnType<typeof rspeedy.build>> | undefined;
	try {
		build = await rspeedy.build();
	} finally {
		await build?.close();
	}
}

async function launchChromium(): Promise<Awaited<ReturnType<typeof chromium.launch>>> {
	try {
		return await chromium.launch({ headless: true });
	} catch (error) {
		throw new Error(
			'Chromium is required for the Lynx Web host smoke test ' +
				'(run `pnpm --filter @octanejs/rspeedy-plugin exec playwright install chromium`): ' +
				(error instanceof Error ? error.message.split('\n')[0] : String(error)),
		);
	}
}

/**
 * Build a fixture, serve it to a real Chromium against `@lynx-js/web-core`, and
 * run `visit` against the mounted page. Mounting a Lynx bundle must never fault
 * the host, so both error channels are asserted empty on the way out for every
 * caller rather than being restated per test.
 */
async function withWebHostPage(
	fixtureRoot: string,
	prefix: string,
	visit: (
		page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>>,
	) => Promise<void>,
): Promise<void> {
	const temporaryRoot = await mkdtemp(resolve(tmpdir(), prefix));
	const outputRoot = resolve(temporaryRoot, 'dist');
	let host: Awaited<ReturnType<typeof startHost>> | undefined;
	let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

	try {
		await buildWebBundle(fixtureRoot, outputRoot);

		host = await startHost(resolve(outputRoot, 'main.web.bundle'));
		browser = await launchChromium();
		const page = await browser.newPage();
		page.setDefaultTimeout(30_000);
		const pageErrors: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error.message));

		await page.goto(host.url, { waitUntil: 'domcontentloaded' });
		await visit(page);

		expect(pageErrors).toEqual([]);
		expect(
			await page.evaluate<string[]>(
				() => (window as typeof window & { __lynxHostErrors: string[] }).__lynxHostErrors,
			),
		).toEqual([]);
	} finally {
		await browser?.close();
		await host?.close();
		await rm(temporaryRoot, { recursive: true, force: true });
	}
}

it('mounts the demo through Lynx for Web and handles a native tap', async () => {
	await withWebHostPage(DEMO_ROOT, 'octane-lynx-web-host-', async (page) => {
		const initialCount = page.getByText('Count 0', { exact: true });
		await initialCount.waitFor({ state: 'visible' });
		expect(await initialCount.count()).toBe(1);
		expect(await page.locator('lynx-view *').count()).toBeGreaterThan(0);

		await page.getByText('Tap to increment', { exact: true }).click();
		const updatedCount = page.getByText('Count 1', { exact: true });
		await updatedCount.waitFor({ state: 'visible' });
		expect(await updatedCount.count()).toBe(1);
	});
}, 90_000);

// Lynx for Web calls a `'main thread'` handler from inside its own wasm element
// context, which then refuses the `__FlushElementTree()` that the documented
// main-thread scripting pattern ends with. Every refusal used to escape the
// handler as an uncaught page error — one per event, so a handler bound to a
// per-frame event flooded the console for as long as the page lived.
it('publishes a main-thread handler flush without faulting the Web host', async () => {
	await withWebHostPage(MAIN_THREAD_FLUSH_ROOT, 'octane-lynx-web-flush-', async (page) => {
		const probe = page.getByText('Tap to flush', { exact: true });
		await probe.waitFor({ state: 'visible' });

		const barHeight = () =>
			page.locator('#flush-bar').evaluate((element) => (element as HTMLElement).style.height);
		expect(await barHeight()).toBe('8px');

		await probe.click();
		await probe.click();
		// The style writes prove the handler ran, so an empty error list is not the
		// vacuous pass of an event that never reached the main thread.
		await expect.poll(barHeight).toBe('24px');
	});
}, 90_000);
