// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import type { Browser, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { launchBrowser } from '../../../../test-utils/playwright-browser.js';
import type * as Cases from '../_fixtures/layout-browser.js';

declare global {
	interface Window {
		layoutCases: typeof Cases;
	}
}
const root = resolve(import.meta.dirname, '../../../..');

function expectGeometry(
	actual: ReturnType<typeof Cases.snapshot>,
	expected: ReturnType<typeof Cases.snapshot>,
): void {
	for (let i = 0; i < actual.length; i++) {
		for (const key of ['left', 'top', 'width', 'height'] as const) {
			expect(actual[i][key], `row ${i} ${key}`).toBeCloseTo(expected[i][key], 2);
		}
	}
}

for (const mode of ['development', 'production']) {
	describe.sequential(`layout observations in ${mode}`, () => {
		let server: Server;
		let browser: Browser;
		let page: Page;
		let url: string;
		let errors: string[];
		beforeAll(async () => {
			const result = await build({
				stdin: {
					contents: `import * as cases from './packages/motion/tests/_fixtures/layout-browser.ts'; window.layoutCases = cases;`,
					resolveDir: root,
				},
				bundle: true,
				write: false,
				format: 'esm',
				platform: 'browser',
				target: 'esnext',
				define: {
					'process.env.NODE_ENV': JSON.stringify(mode),
					__OCTANE_PROFILE_ENABLED__: 'false',
				},
				alias: {
					octane: resolve(root, 'packages/octane/src/index.ts'),
					'@octanejs/motion': resolve(root, 'packages/motion/src/index.ts'),
				},
			});
			server = createServer((request, response) => {
				response.setHeader(
					'Content-Type',
					request.url === '/main.js' ? 'text/javascript' : 'text/html',
				);
				response.end(
					request.url === '/main.js'
						? result.outputFiles[0].text
						: '<!doctype html><main id="main"></main><script type="module" src="/main.js"></script>',
				);
			});
			await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
			url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
			browser = await launchBrowser({
				headless: true,
				executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
			});
		});
		afterAll(async () => {
			await browser?.close();
			await new Promise<void>((done) => server?.close(() => done()));
		});
		afterEach(async () => {
			await page?.close();
			expect(errors).toEqual([]);
		});
		async function open(): Promise<void> {
			page = await browser.newPage();
			errors = [];
			page.on('pageerror', (error) => errors.push(error.message));
			await page.goto(url);
			await page.waitForFunction(() => Boolean(window.layoutCases));
		}

		it('preserves sibling identity and transforms, then measures real ancestor moves and resizing', async () => {
			await open();
			const state = await page.evaluate(() => {
				const api = window.layoutCases;
				api.mount();
				const before = api.nodes();
				api.update();
				const unchanged = api.snapshot();
				api.update({ left: 40, width: 200 });
				return {
					unchanged,
					moved: api.snapshot(),
					identity: api.nodes().every((node, i) => node === before[i]),
				};
			});
			expect(state.identity).toBe(true);
			expect(
				state.unchanged.every((row) => row.transform === 'translateX(2px)' && row.width === 100),
			).toBe(true);
			expectGeometry(state.moved, state.unchanged);
		});

		it('animates width changes selected by a sibling inline transform', async () => {
			await open();
			await page.addStyleTag({
				content: '.changed #row-0[style*="transform"] ~ .row { width: 200px !important; }',
			});
			const state = await page.evaluate(() => {
				const api = window.layoutCases;
				api.mount();
				api.update();
				api.update();
				const before = api.snapshot();
				document.body.classList.add('changed');
				const widths = api.nodes().map((node) => node.getBoundingClientRect().width);
				api.update();
				return { before, widths, rows: api.snapshot() };
			});
			expect(state.widths).toEqual([100, 200, 200, 200]);
			expectGeometry(state.rows, state.before);
		});

		it('animates ancestor padding changes selected by a descendant inline transform', async () => {
			await open();
			await page.addStyleTag({
				content: '.changed #layout-parent:has(> .row[style*="transform"]) { padding-left: 40px; }',
			});
			const state = await page.evaluate(() => {
				const api = window.layoutCases;
				api.mount();
				api.update();
				api.update();
				const before = api.snapshot();
				document.body.classList.add('changed');
				const displacement = api
					.nodes()
					.map((node, i) => node.getBoundingClientRect().left - before[i].left);
				api.update();
				return { before, displacement, rows: api.snapshot() };
			});
			expect(state.displacement).toEqual(Array(4).fill(40));
			expectGeometry(state.rows, state.before);
		});

		it('preserves authored styles before an intervening consumer effect and measures its changes', async () => {
			await open();
			const state = await page.evaluate(() => {
				const api = window.layoutCases;
				api.mount({ barrierAfter: 2 });
				api.update();
				const before = api.snapshot();
				api.onBarrier(() => {
					document.getElementById('layout-parent')!.style.left = '40px';
				});
				api.update();
				return {
					observed: api.observations.at(-1),
					before,
					final: api.snapshot(),
				};
			});
			expect(state.observed).toEqual(Array(4).fill('translateX(2px)'));
			expectGeometry(
				state.final,
				state.before.map((row, index) => ({ ...row, left: row.left + (index < 2 ? 40 : 0) })),
			);
		});

		it('remeasures retained Activity children after an accepted update and an ancestor move while hidden', async () => {
			await open();
			const state = await page.evaluate(() => {
				const api = window.layoutCases;
				api.mount({ cached: true });
				api.update({ version: 1 });
				api.update({ version: 2 });
				const before = api.nodes();
				const boxes = api.snapshot();
				api.update({ mode: 'hidden' });
				document.getElementById('layout-parent')!.style.left = '40px';
				api.update({ mode: 'visible' });
				return {
					rows: api.snapshot(),
					boxes,
					identity: api.nodes().every((node, i) => node === before[i]),
				};
			});
			expect(state.identity).toBe(true);
			expectGeometry(state.rows, state.boxes);
		});

		it('keeps nested synchronous commits from publishing superseded sibling effects', async () => {
			await open();
			const state = await page.evaluate(() => {
				const api = window.layoutCases;
				api.mount({ barrierAfter: 2 });
				api.update();
				const before = api.snapshot();
				api.onBarrier(() => {
					api.onBarrier();
					api.update({ left: 40, version: 2 });
				});
				api.update({ version: 1 });
				return { before, after: api.snapshot() };
			});
			expect(state.after.map((row) => row.version)).toEqual(Array(4).fill('2'));
			expectGeometry(state.after, state.before);
		});

		it('preserves scroll offsets and nested ancestor transforms', async () => {
			await open();
			const state = await page.evaluate(() => {
				const api = window.layoutCases;
				api.mount({ overflow: 'auto', width: 178, initialScroll: 80 });
				const parent = document.getElementById('layout-parent')!;
				parent.scrollLeft = 80;
				api.update();
				const left = api.nodes().map((node) => node.getBoundingClientRect().left);
				api.update();
				const scrolled = {
					offset: parent.scrollLeft,
					left: api.nodes().map((node) => node.getBoundingClientRect().left),
				};
				api.mount({ ancestorTransform: 'translateX(20px)' });
				api.update();
				api.update();
				return { left, scrolled, nested: api.snapshot().map((row) => row.transform) };
			});
			expect(state.scrolled).toEqual({ offset: 80, left: state.left });
			expect(state.nested).toEqual(Array(4).fill('translateX(2px)'));
		});

		it('preserves surviving siblings and sends a measurement failure to its own boundary', async () => {
			await open();
			const state = await page.evaluate(() => {
				const api = window.layoutCases;
				api.mount({ boundaries: true });
				api.update();
				const before = api.nodes();
				const bad = before[2];
				const original = bad.getBoundingClientRect;
				let fail = true;
				bad.getBoundingClientRect = function () {
					if (fail) {
						fail = false;
						throw new Error('measurement failed');
					}
					return original.call(this);
				};
				api.update();
				return {
					caught: document.getElementById('failed-2')?.textContent,
					survivors: api.nodes().map((node) => node.id),
					identity: api.nodes().every((node) => before.includes(node)),
					transforms: api.nodes().map((node) => node.style.transform),
				};
			});
			expect(state.caught).toBe('caught');
			expect(state.survivors).toEqual(['row-0', 'row-1', 'row-3']);
			expect(state.identity).toBe(true);
			expect(state.transforms).toEqual(Array(3).fill('translateX(2px)'));
		});
	});
}
