import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { octane } from 'octane/compiler/vite';
import type {} from './main';

// A backlog of ready Actions renders once, in a later task than the input that
// released it (#1864). Rendering each queued result in the release click's
// microtask checkpoint delayed that click's next paint by the whole backlog,
// which Chromium's Event Timing reports as the interaction's latency. React
// 19.2.7 runs the same fixture with one result render.

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, '../../_fixtures/action-backlog.tsrx');
const REACT_FIXTURE_ID = '\0action-backlog-react-fixture';
const BACKLOG = 12;
const BUSY_MS = 12;
let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
let page: Page | undefined;
let pageFailures: string[] = [];

function reactFixturePlugin(): Plugin {
	return {
		name: 'action-backlog-react-fixture',
		enforce: 'pre',
		async resolveId(id, importer) {
			if (id === 'virtual:action-backlog-react-fixture') return REACT_FIXTURE_ID;
			if (id === 'octane' && importer === REACT_FIXTURE_ID) {
				return this.resolve('react', FIXTURE, { skipSelf: true });
			}
		},
		load(id) {
			if (id !== REACT_FIXTURE_ID) return;
			const result = compileToReact(readFileSync(FIXTURE, 'utf8'), FIXTURE);
			if (result.errors?.length)
				throw new Error(result.errors.map((error: Error) => error.message).join('\n'));
			return transformSync(result.code, {
				loader: 'tsx',
				jsx: 'automatic',
				jsxImportSource: 'react',
				target: 'esnext',
				format: 'esm',
				sourcefile: FIXTURE,
			}).code;
		},
	};
}

beforeAll(async () => {
	server = await createServer({
		configFile: false,
		root: HERE,
		logLevel: 'error',
		cacheDir: resolve(HERE, '../../../../../node_modules/.vite/octane-action-backlog'),
		plugins: [reactFixturePlugin(), octane()],
		server: { host: '127.0.0.1', port: 0 },
	});
	await server.listen();
	const address = server.httpServer!.address();
	if (!address || typeof address === 'string') throw new Error('No Vite TCP port');
	baseUrl = `http://127.0.0.1:${address.port}`;
	browser = await launchBrowser({ headless: true });
});

afterEach(async () => {
	const failures = pageFailures;
	await page?.close();
	page = undefined;
	pageFailures = [];
	expect(failures).toEqual([]);
});

afterAll(async () => {
	await browser?.close();
	await server?.close();
});

async function runBacklog(runtime: 'octane' | 'react') {
	page = await browser.newPage();
	page.on('pageerror', (error) => pageFailures.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'warning' || message.type() === 'error')
			pageFailures.push(message.text());
	});
	await page.goto(baseUrl);
	await page.waitForFunction(() => Boolean(window.__actionBacklog));
	await page.evaluate(([runtime, busyMs]) => window.__actionBacklog.mount(runtime, busyMs), [
		runtime,
		BUSY_MS,
	] as const);
	await page.waitForSelector(`#${runtime}-root [data-release]`);
	await page.evaluate(([runtime, count]) => window.__actionBacklog.submit(runtime, count), [
		runtime,
		BACKLOG,
	] as const);
	await page.waitForFunction(
		(runtime) => window.__actionBacklog.pending(runtime) === 'pending',
		runtime,
	);
	const before = await page.evaluate((runtime) => window.__actionBacklog.probe(runtime), runtime);
	await page.locator(`#${runtime}-root [data-release]`).click();
	await page.waitForFunction(
		(runtime) => window.__actionBacklog.pending(runtime) === 'idle',
		runtime,
	);
	// Event Timing delivers entries after the interaction's next paint.
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50))),
			),
	);
	const after = await page.evaluate((runtime) => window.__actionBacklog.probe(runtime), runtime);
	const latency = await page.evaluate(
		(runtime) => window.__actionBacklog.latency(runtime),
		runtime,
	);
	return {
		commits: after.commits.slice(before.commits.length),
		results: after.results.slice(before.results.length),
		latency,
	};
}

describe.sequential('a released Action backlog', () => {
	it.each(['octane', 'react'] as const)(
		'%s: renders the backlog once, without holding the release click for every result',
		async (runtime) => {
			const { commits, results, latency } = await runBacklog(runtime);

			expect(commits.at(-1)).toEqual({ state: BACKLOG, pending: false });
			expect(results).toEqual([BACKLOG]);
			// One result render costs BUSY_MS; the whole backlog costs BACKLOG times that.
			expect(latency).toBeLessThan((BACKLOG * BUSY_MS) / 2);
		},
	);
});
