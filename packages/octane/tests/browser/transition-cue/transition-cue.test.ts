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

// A component that raises `isPending` and also holds its transition's own update
// commits the pending cue first, with the previous state, and renders the
// transition in a later task (#1864). Rendering both in the click's microtask
// checkpoint delayed the click's next paint by the whole slow render, which
// Chromium's Event Timing reports as the interaction's latency. React 19.2.7
// commits "Sorting…" urgently and renders the sort in a Scheduler task.

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, '../../_fixtures/transition-sort.tsrx');
const REACT_FIXTURE_ID = '\0transition-sort-react-fixture';
const BUSY_MS = 120;
let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
let page: Page | undefined;
let pageFailures: string[] = [];

function reactFixturePlugin(): Plugin {
	return {
		name: 'transition-sort-react-fixture',
		enforce: 'pre',
		async resolveId(id, importer) {
			if (id === 'virtual:transition-sort-react-fixture') return REACT_FIXTURE_ID;
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
		cacheDir: resolve(HERE, '../../../../../node_modules/.vite/octane-transition-cue'),
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

async function clickSort(runtime: 'octane' | 'react') {
	page = await browser.newPage();
	page.on('pageerror', (error) => pageFailures.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'warning' || message.type() === 'error')
			pageFailures.push(message.text());
	});
	await page.goto(baseUrl);
	await page.waitForFunction(() => Boolean(window.__transitionCue));
	await page.evaluate(([runtime, busyMs]) => window.__transitionCue.mount(runtime, busyMs), [
		runtime,
		BUSY_MS,
	] as const);
	await page.waitForSelector(`#${runtime}-root [data-sort]`);
	const before = await page.evaluate((runtime) => window.__transitionCue.commits(runtime), runtime);
	await page.locator(`#${runtime}-root [data-sort]`).click();
	await page.waitForFunction(
		(runtime) => window.__transitionCue.list(runtime) === 'sorted',
		runtime,
	);
	// Event Timing delivers entries after the interaction's next paint.
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50))),
			),
	);
	const after = await page.evaluate((runtime) => window.__transitionCue.commits(runtime), runtime);
	const latency = await page.evaluate(
		(runtime) => window.__transitionCue.latency(runtime),
		runtime,
	);
	return { commits: after.slice(before.length), latency };
}

describe.sequential('a pending cue in the component that holds the transition', () => {
	it.each(['octane', 'react'] as const)(
		'%s: paints the cue before the slow transition render',
		async (runtime) => {
			const { commits, latency } = await clickSort(runtime);

			expect(commits[0]).toEqual({ label: 'Sorting…', sorted: false });
			expect(commits.at(-1)).toEqual({ label: 'Unsort', sorted: true });
			// The slow list renders once, after the cue's paint, not within the click.
			expect(latency).toBeLessThan(BUSY_MS / 2);
		},
	);
});
