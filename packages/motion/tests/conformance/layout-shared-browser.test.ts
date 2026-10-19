// @vitest-environment node
import { resolve } from 'node:path';
import { build } from 'esbuild';
import type { Browser, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { launchBrowser } from '../../../../test-utils/playwright-browser.js';
import type * as Cases from '../_fixtures/layout-shared-browser.js';

declare global {
	interface Window {
		sharedLayout: typeof Cases;
	}
}

const root = resolve(import.meta.dirname, '../../../..');
type Box = Pick<ReturnType<typeof Cases.snapshot>, 'left' | 'top' | 'width' | 'height'>;

function expectBox(actual: Box, expected: Box): void {
	for (const key of ['left', 'top', 'width', 'height'] as const) {
		expect(actual[key], key).toBeCloseTo(expected[key], 2);
	}
}

for (const mode of ['development', 'production']) {
	describe.sequential(`shared layout in ${mode}`, () => {
		let browser: Browser;
		let page: Page;
		let script: string;
		let errors: string[];

		beforeAll(async () => {
			const result = await build({
				stdin: {
					contents: `import * as cases from './packages/motion/tests/_fixtures/layout-shared-browser.ts'; window.sharedLayout = cases;`,
					resolveDir: root,
				},
				bundle: true,
				write: false,
				format: 'iife',
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
			script = result.outputFiles[0].text;
			browser = await launchBrowser({
				headless: true,
				executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
			});
		});
		beforeEach(async () => {
			page = await browser.newPage();
			errors = [];
			page.on('pageerror', (error) => errors.push(error.message));
			await page.setContent(
				'<!doctype html><style>body { margin: 0; }</style><main id="main"></main>',
			);
			await page.addScriptTag({ content: script });
		});
		afterEach(async () => {
			await page?.close();
			expect(errors).toEqual([]);
		});
		afterAll(async () => {
			await browser?.close();
		});

		// @parity-case conformance:bounded-layoutId
		it('starts a same-id replacement at the departing element and finishes at its own layout', async () => {
			const state = await page.evaluate(async () => {
				const api = window.sharedLayout;
				api.mount('before');
				const before = api.snapshot('before');
				api.unmount('before');
				const completed = api.nextCompletion('after');
				api.mount('after', { left: 200 });
				const start = api.snapshot('after');
				await completed;
				return { before, start, finished: api.snapshot('after') };
			});
			expectBox(state.start, state.before);
			expectBox(state.finished, { left: 200, top: 0, width: 100, height: 100 });
		});

		it('stops a layoutId-only animation when reduced motion becomes active', async () => {
			const state = await page.evaluate(async () => {
				const api = window.sharedLayout;
				api.mount('before');
				api.unmount('before');
				api.mount('after', { left: 200 });
				const start = api.snapshot('after');
				api.update('after', { reducedMotion: 'always' });
				const stopped = api.snapshot('after');
				await api.nextFrame();
				await api.nextFrame();
				return { start, stopped, unchanged: api.snapshot('after') };
			});
			expectBox(state.start, { left: 0, top: 0, width: 100, height: 100 });
			expectBox(state.stopped, { left: 200, top: 0, width: 100, height: 100 });
			expect(state.stopped.transform).toBe('');
			expectBox(state.unchanged, state.stopped);
			expect(state.unchanged.transform).toBe('');
		});

		it('preserves a layoutId-only animation across unchanged updates', async () => {
			const state = await page.evaluate(async () => {
				const api = window.sharedLayout;
				api.mount('before');
				api.unmount('before');
				const completed = api.nextCompletion('after');
				api.mount('after', { left: 200 });
				const start = api.snapshot('after');
				api.update('after', {});
				const unchanged = api.snapshot('after');
				await completed;
				return { start, unchanged, finished: api.snapshot('after') };
			});
			expectBox(state.start, { left: 0, top: 0, width: 100, height: 100 });
			expectBox(state.unchanged, state.start);
			expect(state.unchanged.transform).toBe(state.start.transform);
			expectBox(state.finished, { left: 200, top: 0, width: 100, height: 100 });
			expect(state.finished.transform).toBe('');
		});

		it.each([
			{
				property: 'scale',
				width: 100,
				css: 'scale: 2;',
				expected: { left: 200, top: 0, width: 200, height: 200 },
			},
			{
				property: 'rotation with unchanged bounds',
				width: 100,
				css: 'rotate: 180deg; transform-origin: 50% 50% !important;',
				expected: { left: 200, top: 0, width: 100, height: 100 },
			},
			{
				property: 'origin with unchanged bounds',
				width: 200,
				css: 'transform-origin: 50% 50% !important;',
				expected: { left: 200, top: 0, width: 200, height: 100 },
			},
		])('stops a layoutId-only projection when authored $property changes', async (input) => {
			const state = await page.evaluate(async ({ width, css }) => {
				const api = window.sharedLayout;
				api.mount('before');
				api.unmount('before');
				api.mount('after', { left: 200, width });
				const start = api.snapshot('after');
				const style = document.createElement('style');
				style.textContent = `#shared-after { ${css} }`;
				document.head.appendChild(style);
				api.update('after', {});
				const stopped = api.snapshot('after');
				await api.nextFrame();
				await api.nextFrame();
				return { start, stopped, unchanged: api.snapshot('after') };
			}, input);
			expectBox(state.start, { left: 0, top: 0, width: 100, height: 100 });
			expectBox(state.stopped, input.expected);
			expect(state.stopped.transform).toBe('');
			expectBox(state.unchanged, state.stopped);
			expect(state.unchanged.transform).toBe('');
		});

		it.each([undefined, 'pipeline-environments'])(
			'expires an unclaimed shared box before a later reopen (group: %s)',
			async (groupId) => {
				const state = await page.evaluate(async (groupId) => {
					const api = window.sharedLayout;
					api.mount('before', { groupId });
					api.unmount('before');
					await Promise.resolve();
					api.mount('after', { groupId, left: 200 });
					const start = api.snapshot('after');
					await api.nextFrame();
					await api.nextFrame();
					return { start, unchanged: api.snapshot('after') };
				}, groupId);
				expectBox(state.start, { left: 200, top: 0, width: 100, height: 100 });
				expectBox(state.unchanged, state.start);
				expect(state.start.transform).toBe('');
				expect(state.unchanged.transform).toBe('');
			},
		);

		it('preserves the authored transform when a position-only replacement has no position delta', async () => {
			const state = await page.evaluate(async () => {
				const api = window.sharedLayout;
				const options = { layout: 'position' as const, transform: 'rotate(15deg)' };
				api.mount('before', options);
				const before = api.snapshot('before');
				api.unmount('before');
				api.mount('after', { ...options, width: 200 });
				const start = api.snapshot('after');
				await api.nextFrame();
				await api.nextFrame();
				return { before, start, unchanged: api.snapshot('after') };
			});
			expect(state.start.left).toBeCloseTo(state.before.left, 2);
			expect(state.start.top).toBeCloseTo(state.before.top, 2);
			expect(state.start.width).toBeGreaterThan(state.before.width);
			expect(state.start.transform).toBe('rotate(15deg)');
			expect(state.unchanged.transform).toBe('rotate(15deg)');
			expectBox(state.unchanged, state.start);
		});

		it('preserves shared layout during a keyed replacement in one group', async () => {
			const state = await page.evaluate(async () => {
				const api = window.sharedLayout;
				api.mount('hero', { groupId: 'pipeline' });
				const beforeNode = api.node('hero');
				const before = api.snapshot('hero');
				const completed = api.nextCompletion('hero');
				api.update('hero', { key: 'after', left: 200 });
				const replaced = api.node('hero') !== beforeNode;
				const start = api.snapshot('hero');
				await completed;
				return { before, start, replaced, finished: api.snapshot('hero') };
			});
			expect(state.replaced).toBe(true);
			expectBox(state.start, state.before);
			expectBox(state.finished, { left: 200, top: 0, width: 100, height: 100 });
		});

		it.each([
			{ firstGroup: 'first', firstId: 'hero', otherGroup: 'second', otherId: 'hero' },
			{ firstGroup: 'a-b', firstId: 'c', otherGroup: 'a', otherId: 'b-c' },
		])('isolates shared ids in $firstGroup from $otherGroup', async (groups) => {
			const state = await page.evaluate(async (groups) => {
				const api = window.sharedLayout;
				const first = { groupId: groups.firstGroup, layoutId: groups.firstId };
				api.mount('before', first);
				const before = api.snapshot('before');
				api.unmount('before');
				api.mount('other', {
					groupId: groups.otherGroup,
					layoutId: groups.otherId,
					left: 200,
				});
				const unrelated = api.snapshot('other');
				api.unmount('other');
				const completed = api.nextCompletion('matching');
				api.mount('matching', { ...first, left: 300 });
				const start = api.snapshot('matching');
				await completed;
				return { before, unrelated, start, finished: api.snapshot('matching') };
			}, groups);
			expectBox(state.unrelated, { left: 200, top: 0, width: 100, height: 100 });
			expect(state.unrelated.transform).toBe('');
			expectBox(state.start, state.before);
			expectBox(state.finished, { left: 300, top: 0, width: 100, height: 100 });
		});

		it('publishes a departing element under its updated group namespace', async () => {
			const state = await page.evaluate(async () => {
				const api = window.sharedLayout;
				api.mount('before', { groupId: 'switch-before' });
				api.update('before', { groupId: 'switch-after', left: 100 });
				const before = api.snapshot('before');
				api.unmount('before');
				const completed = api.nextCompletion('after');
				api.mount('after', { groupId: 'switch-after', left: 300 });
				const start = api.snapshot('after');
				await completed;
				return { before, start, finished: api.snapshot('after') };
			});
			expectBox(state.before, { left: 100, top: 0, width: 100, height: 100 });
			expectBox(state.start, state.before);
			expectBox(state.finished, { left: 300, top: 0, width: 100, height: 100 });
		});

		it('does not publish a shared box when a mounted element changes namespaces', async () => {
			const state = await page.evaluate(async () => {
				const api = window.sharedLayout;
				api.mount('survivor', { groupId: 'before' });
				const survivor = api.node('survivor');
				api.update('survivor', { groupId: 'after', left: 100 });
				api.mount('old-namespace', { groupId: 'before', left: 300 });
				const start = api.snapshot('old-namespace');
				await api.nextFrame();
				await api.nextFrame();
				return {
					start,
					unchanged: api.snapshot('old-namespace'),
					retained: api.node('survivor') === survivor,
				};
			});
			expect(state.retained).toBe(true);
			expectBox(state.start, { left: 300, top: 0, width: 100, height: 100 });
			expectBox(state.unchanged, state.start);
			expect(state.start.transform).toBe('');
			expect(state.unchanged.transform).toBe('');
		});
	});
}
