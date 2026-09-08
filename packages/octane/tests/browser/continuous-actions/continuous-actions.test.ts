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
import type { ActionProbeOptions } from '../../_fixtures/continuous-actions.tsrx';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, '../../_fixtures/continuous-actions.tsrx');
const REACT_FIXTURE_ID = '\0continuous-actions-react-fixture';
let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
let page: Page | undefined;
let pageFailures: string[] = [];

function reactFixturePlugin(): Plugin {
	return {
		name: 'continuous-actions-react-fixture',
		enforce: 'pre',
		async resolveId(id, importer) {
			if (id === 'virtual:continuous-actions-react-fixture') return REACT_FIXTURE_ID;
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
		cacheDir: resolve(HERE, '../../../../../node_modules/.vite/octane-continuous-actions'),
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

async function openCase(options: ActionProbeOptions): Promise<Page> {
	page = await browser.newPage();
	page.on('pageerror', (error) => pageFailures.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'warning' || message.type() === 'error')
			pageFailures.push(message.text());
	});
	await page.goto(baseUrl);
	await page.waitForFunction(() => Boolean(window.__continuousActions));
	await page.evaluate((options) => window.__continuousActions.mount(options), options);
	await page.waitForSelector('#octane-root [data-start]');
	await page.waitForSelector('#react-root [data-start]');
	return page;
}

async function startActions(page: Page): Promise<void> {
	await page.locator('#octane-root [data-start]').click();
	await page.locator('#react-root [data-start]').click();
	await page.waitForFunction(() =>
		['octane', 'react'].every(
			(runtime) =>
				window.__continuousActions.state(runtime as 'octane' | 'react').pending === 'pending',
		),
	);
}

async function readBoth(page: Page) {
	return page.evaluate(() => ({
		octane: window.__continuousActions.state('octane'),
		react: window.__continuousActions.state('react'),
	}));
}

async function taskBoundary(page: Page): Promise<void> {
	await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}

async function releaseActions(page: Page): Promise<void> {
	await page.evaluate(() => window.__continuousActions.release());
	await page.waitForFunction(() =>
		['octane', 'react'].every(
			(runtime) =>
				window.__continuousActions.state(runtime as 'octane' | 'react').pending === 'idle',
		),
	);
}

describe.sequential('continuous input during async Actions', () => {
	// React 19.2.7 classifies mousemove as continuous input rather than a transition:
	// https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/events/ReactDOMEventListener.js#L372-L391
	for (const phase of ['capture', 'bubble'] as const) {
		for (const interaction of ['trusted', 'programmatic'] as const) {
			it(`${phase}: accepts ${interaction} input before the pending Action settles without synchronous DOM writes`, async () => {
				const page = await openCase({ phase });
				await startActions(page);
				for (const runtime of ['octane', 'react'] as const) {
					if (interaction === 'trusted') {
						const box = await page.locator(`#${runtime}-root [data-move]`).boundingBox();
						if (!box) throw new Error('Missing input surface');
						await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
					} else {
						const immediate = await page.evaluate((runtime) => {
							document
								.querySelector(`#${runtime}-root [data-move]`)!
								.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
							return window.__continuousActions.state(runtime);
						}, runtime);
						expect(immediate).toEqual({ moves: 0, saved: 'initial', pending: 'pending' });
					}
				}
				await page.waitForFunction(() => window.__continuousActions.state('react').moves === 1);
				const logs = await page.evaluate(() => window.__continuousActions.logs);
				for (const runtime of ['octane', 'react'] as const) {
					expect(logs[runtime]).toEqual([
						{
							label: 'before',
							trusted: interaction === 'trusted',
							moves: 0,
							saved: 'initial',
							pending: 'pending',
						},
						{
							label: 'after',
							trusted: interaction === 'trusted',
							moves: 0,
							saved: 'initial',
							pending: 'pending',
						},
					]);
				}
				const pending = await readBoth(page);
				expect(pending.react).toEqual({ moves: 1, saved: 'initial', pending: 'pending' });
				expect(pending.octane).toEqual(pending.react);
				await releaseActions(page);
				const settled = await readBoth(page);
				expect(settled.react).toEqual({ moves: 1, saved: 'finished', pending: 'idle' });
				expect(settled.octane).toEqual(settled.react);
			});
		}

		it(`${phase}: keeps explicitly transitioned input inside the pending Action`, async () => {
			const page = await openCase({ phase, transition: true });
			await startActions(page);
			await page.evaluate(() => {
				for (const runtime of ['octane', 'react'] as const) {
					document
						.querySelector(`#${runtime}-root [data-move]`)!
						.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
				}
			});
			await taskBoundary(page);
			const pending = await readBoth(page);
			expect(pending.react).toEqual({ moves: 0, saved: 'initial', pending: 'pending' });
			expect(pending.octane).toEqual(pending.react);
			await releaseActions(page);
			const settled = await readBoth(page);
			expect(settled.react).toEqual({ moves: 1, saved: 'finished', pending: 'idle' });
			expect(settled.octane).toEqual(settled.react);
		});

		it(`${phase}: retains the Action's post-await write after a trusted click`, async () => {
			const page = await openCase({ phase, postAwait: true });
			await page.locator('#octane-root [data-start]').click();
			await page.waitForFunction(() =>
				window.__continuousActions.logs.octane.some(({ label }) => label === 'continuation'),
			);
			await taskBoundary(page);
			// OCTANE DIVERGENCE: an Action retains its unwrapped post-await writes.
			// A trusted event's callback microtasks still expose window.event, but
			// the Action continuation must not be mistaken for new user input.
			expect(await page.evaluate(() => window.__continuousActions.state('octane'))).toEqual({
				moves: 0,
				saved: 'initial',
				pending: 'pending',
			});
			await releaseActions(page);
			expect(await page.evaluate(() => window.__continuousActions.state('octane'))).toEqual({
				moves: 0,
				saved: 'finished',
				pending: 'idle',
			});
		});
	}
});
