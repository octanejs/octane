// @vitest-environment node
import { resolve } from 'node:path';
import { build } from 'esbuild';
import type { Browser, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { launchBrowser } from '../../../../test-utils/playwright-browser.js';
import type * as Cases from '../_fixtures/layout-edge-browser.js';

declare global {
	interface Window {
		layoutEdges: typeof Cases;
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
	describe.sequential(`layout geometry in ${mode}`, () => {
		let browser: Browser;
		let page: Page;
		let script: string;
		let errors: string[];

		beforeAll(async () => {
			const result = await build({
				stdin: {
					contents: `import * as cases from './packages/motion/tests/_fixtures/layout-edge-browser.ts'; window.layoutEdges = cases;`,
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

		it('preserves an in-flight layout animation across unchanged updates and its final position afterward', async () => {
			const state = await page.evaluate(async () => {
				const api = window.layoutEdges;
				api.mount({ origin: '0 0' });
				const completed = api.nextCompletion();
				api.update({ left: 200 });
				await api.waitForLeftBetween(125, 175);
				const before = api.snapshot();
				api.update();
				const after = api.snapshot();
				await completed;
				const finished = api.snapshot();
				api.update();
				await api.nextFrame();
				await api.nextFrame();
				return { before, after, finished, unchanged: api.snapshot() };
			});
			expect(state.before.left).toBeGreaterThan(125);
			expect(state.before.left).toBeLessThan(175);
			expectBox(state.before, { left: state.before.left, top: 100, width: 100, height: 50 });
			expectBox(state.after, state.before);
			expectBox(state.finished, { left: 200, top: 100, width: 100, height: 50 });
			expectBox(state.unchanged, state.finished);
		});

		// @parity-case conformance:bounded-layout-flip
		it('starts resizing at the previous visual box with the default transform origin', async () => {
			const state = await page.evaluate(async () => {
				const api = window.layoutEdges;
				api.mount();
				const before = api.snapshot();
				const completed = api.nextCompletion();
				api.update({ width: 200 });
				const start = api.snapshot();
				await completed;
				const finished = api.snapshot();
				api.update();
				return { before, start, finished, unchanged: api.snapshot() };
			});
			expectBox(state.start, state.before);
			expectBox(state.finished, { left: 100, top: 100, width: 200, height: 50 });
			expectBox(state.unchanged, state.finished);
		});

		it('preserves scrolling when the measured transform is the only source of overflow', async () => {
			const state = await page.evaluate(async () => {
				const api = window.layoutEdges;
				api.mount({ scroll: true, left: 0, top: 0, height: 20, transform: 'translateX(200px)' });
				document.getElementById('layout-parent')!.scrollLeft = 200;
				const before = api.snapshot();
				api.update();
				const after = api.snapshot();
				await api.nextFrame();
				await api.nextFrame();
				const finished = api.snapshot();
				api.update();
				return { before, after, finished, unchanged: api.snapshot() };
			});
			expect(state.before.scrollLeft).toBe(200);
			for (const value of [state.after, state.finished, state.unchanged]) {
				expect(value.scrollLeft).toBe(200);
				expectBox(value, state.before);
			}
		});

		it('preserves inline transform priority against an important stylesheet rule', async () => {
			await page.addStyleTag({
				content: '#layout-target { transform: translateX(50px) !important; }',
			});
			const state = await page.evaluate(async () => {
				const api = window.layoutEdges;
				api.mount({ important: true, left: 0, top: 0 });
				const mounted = api.snapshot();
				api.update();
				await api.nextFrame();
				await api.nextFrame();
				const finished = api.snapshot();
				api.update();
				return { mounted, finished, unchanged: api.snapshot() };
			});
			for (const value of [state.mounted, state.finished, state.unchanged]) {
				expect(value.priority).toBe('important');
				expectBox(value, { left: 20, top: 0, width: 100, height: 50 });
			}
		});

		it.each([
			{ name: 'independent CSS scale', css: 'scale: 2;', style: {} },
			{ name: 'independent CSS rotate', css: 'rotate: 90deg;', style: {} },
			{ name: 'Motion style.scale', css: '', style: { scale: 2 } },
			{ name: 'Motion style.rotate', css: '', style: { rotate: 90 } },
			{ name: 'CSS scale with Motion translation', css: 'scale: 2;', style: { style: { x: 30 } } },
			{
				name: 'CSS rotation with Motion translation',
				css: 'rotate: 90deg;',
				style: { style: { x: 30 } },
			},
			{ name: 'CSS scale with Motion rotation', css: 'scale: 2 3;', style: { rotate: 30 } },
		])('preserves $name while animating a layout move', async ({ css, style }) => {
			if (css) await page.addStyleTag({ content: `#layout-target { ${css} }` });
			const state = await page.evaluate(async (style) => {
				const api = window.layoutEdges;
				api.mount({ origin: '0 0', ...style });
				const before = api.snapshot();
				const completed = api.nextCompletion();
				api.update({ left: 150 });
				const start = api.snapshot();
				await completed;
				const finished = api.snapshot();
				api.update();
				return { before, start, finished, unchanged: api.snapshot() };
			}, style);
			expectBox(state.start, state.before);
			expectBox(state.finished, { ...state.before, left: state.before.left + 50 });
			expectBox(state.unchanged, state.finished);
		});

		it('inherits the root duration when the layout transition requests inheritance', async () => {
			const state = await page.evaluate(async () => {
				const api = window.layoutEdges;
				let completed = false;
				api.mount({
					transition: {
						duration: 0,
						layout: {
							inherit: true,
							onComplete: () => {
								completed = true;
							},
						},
					},
				});
				api.update({ left: 200 });
				await api.nextFrame();
				await api.nextFrame();
				return { completed, box: api.snapshot() };
			});
			expect(state.completed).toBe(true);
			expectBox(state.box, { left: 200, top: 100, width: 100, height: 50 });
		});

		it.each([
			{ key: 'x', from: 10, to: 40, box: { left: 240, top: 100, width: 100, height: 50 } },
			{ key: 'y', from: 10, to: 40, box: { left: 200, top: 140, width: 100, height: 50 } },
			{ key: 'scale', from: 1, to: 2, box: { left: 200, top: 100, width: 200, height: 100 } },
			{ key: 'rotate', from: 0, to: 90, box: { left: 150, top: 100, width: 50, height: 100 } },
			{
				key: 'transform',
				from: 'translateX(10px)',
				to: 'translateX(40px)',
				box: { left: 240, top: 100, width: 100, height: 50 },
			},
		])(
			'settles the layout projection before a style.$key MotionValue takes ownership',
			async ({ key, from, to, box }) => {
				const state = await page.evaluate(
					async ({ key, from, to }) => {
						const api = window.layoutEdges;
						const value = api.motionValue(from);
						api.mount({ origin: '0 0', duration: 10, style: { [key]: value } });
						api.update({ left: 200 });
						value.set(to);
						const changed = api.snapshot();
						await api.nextFrame();
						await api.nextFrame();
						return { changed, later: api.snapshot() };
					},
					{ key, from, to },
				);
				expectBox(state.changed, box);
				expectBox(state.later, box);
			},
		);

		it.each(['rebind', 'static', 'remove'] as const)(
			'clears the layout projection when a transform binding is changed: %s',
			async (action) => {
				const state = await page.evaluate(async (action) => {
					const api = window.layoutEdges;
					const first = api.motionValue(10);
					const second = api.motionValue(40);
					api.mount({ origin: '0 0', duration: 10, style: { x: first, y: 15 } });
					api.update({ left: 200 });
					api.update({
						style:
							action === 'remove' ? { y: 15 } : { x: action === 'rebind' ? second : 40, y: 15 },
					});
					const changed = api.snapshot();
					first.set(90);
					await api.nextFrame();
					await api.nextFrame();
					return { changed, later: api.snapshot() };
				}, action);
				const box = { left: action === 'remove' ? 200 : 240, top: 115, width: 100, height: 50 };
				expectBox(state.changed, box);
				expectBox(state.later, box);
			},
		);

		it('keeps a layout animation running when an opacity MotionValue changes', async () => {
			const state = await page.evaluate(async () => {
				const api = window.layoutEdges;
				const opacity = api.motionValue(1);
				api.mount({ style: { opacity } });
				const completed = api.nextCompletion();
				api.update({ left: 200 });
				const before = api.snapshot();
				opacity.set(0.5);
				const after = api.snapshot();
				await completed;
				return { before, after, finished: api.snapshot(), opacity: api.target().style.opacity };
			});
			expectBox(state.after, state.before);
			expectBox(state.finished, { left: 200, top: 100, width: 100, height: 50 });
			expect(state.opacity).toBe('0.5');
		});

		it('continues from the visible box when another layout move and resize interrupts an animation', async () => {
			const state = await page.evaluate(async () => {
				const api = window.layoutEdges;
				api.mount({ origin: '0 0' });
				const completed = api.nextCompletion();
				api.update({ left: 200 });
				await api.waitForLeftBetween(125, 175);
				const before = api.snapshot();
				api.update({ left: 300, width: 200 });
				const interrupted = api.snapshot();
				await completed;
				const finished = api.snapshot();
				api.update();
				return { before, interrupted, finished, unchanged: api.snapshot() };
			});
			expect(state.before.left).toBeGreaterThan(125);
			expect(state.before.left).toBeLessThan(175);
			expectBox(state.interrupted, state.before);
			expectBox(state.finished, { left: 300, top: 100, width: 200, height: 50 });
			expectBox(state.unchanged, state.finished);
		});

		it('preserves important transform styling through a real layout move and its completion', async () => {
			await page.addStyleTag({
				content: '#layout-target { transform: translateX(50px) !important; }',
			});
			const state = await page.evaluate(async () => {
				const api = window.layoutEdges;
				api.mount({ important: true });
				const before = api.snapshot();
				const completed = api.nextCompletion();
				api.update({ left: 150 });
				const start = api.snapshot();
				await completed;
				const finished = api.snapshot();
				api.update();
				return { before, start, finished, unchanged: api.snapshot() };
			});
			expectBox(state.before, { left: 120, top: 100, width: 100, height: 50 });
			expectBox(state.start, state.before);
			expectBox(state.finished, { left: 170, top: 100, width: 100, height: 50 });
			expectBox(state.unchanged, state.finished);
			for (const value of [state.before, state.start, state.finished, state.unchanged]) {
				expect(value.priority).toBe('important');
			}
		});

		it('applies a style.scale change without canceling it with a layout projection', async () => {
			const state = await page.evaluate(async () => {
				const api = window.layoutEdges;
				api.mount({ origin: '0 0', scale: 1 });
				api.update({ scale: 2 });
				const changed = api.snapshot();
				await api.nextFrame();
				await api.nextFrame();
				api.update();
				return { changed, unchanged: api.snapshot() };
			});
			expectBox(state.changed, { left: 100, top: 100, width: 200, height: 100 });
			expectBox(state.unchanged, state.changed);
		});

		it.each(['position', 'size'] as const)(
			'only projects the requested %s layout change',
			async (layout) => {
				const state = await page.evaluate(async (layout) => {
					const api = window.layoutEdges;
					api.mount({ layout, origin: '0 0' });
					const completed = api.nextCompletion();
					api.update({ left: 150, width: 200 });
					const start = api.snapshot();
					await completed;
					const finished = api.snapshot();
					api.update();
					return { start, finished, unchanged: api.snapshot() };
				}, layout);
				expectBox(state.start, {
					left: layout === 'position' ? 100 : 150,
					top: 100,
					width: layout === 'size' ? 100 : 200,
					height: 50,
				});
				expectBox(state.finished, { left: 150, top: 100, width: 200, height: 50 });
				expectBox(state.unchanged, state.finished);
			},
		);

		it.each([undefined, 'hero'])(
			'clears an active projection when layout is disabled and starts fresh when re-enabled (layoutId %s)',
			async (layoutId) => {
				const state = await page.evaluate(async (layoutId) => {
					const api = window.layoutEdges;
					api.mount({ origin: '0 0', layoutId });
					api.update({ left: 200 });
					await api.waitForLeftBetween(125, 175);
					api.update({ layout: false, left: 250 });
					const disabled = api.snapshot();
					await api.nextFrame();
					await api.nextFrame();
					const later = api.snapshot();
					api.update({ layout: true, left: 300 });
					const enabled = api.snapshot();
					const completed = api.nextCompletion();
					api.update({ left: 350 });
					const start = api.snapshot();
					await completed;
					const finished = api.snapshot();
					api.update();
					return { disabled, later, enabled, start, finished, unchanged: api.snapshot() };
				}, layoutId);
				expectBox(state.disabled, { left: 250, top: 100, width: 100, height: 50 });
				expectBox(state.later, state.disabled);
				expectBox(state.enabled, { left: 300, top: 100, width: 100, height: 50 });
				expectBox(state.start, state.enabled);
				expectBox(state.finished, { left: 350, top: 100, width: 100, height: 50 });
				expectBox(state.unchanged, state.finished);
			},
		);

		it('settles an active layout animation when reduced motion is enabled', async () => {
			const state = await page.evaluate(async () => {
				const api = window.layoutEdges;
				api.mount({ origin: '0 0' });
				api.update({ left: 200 });
				await api.waitForLeftBetween(125, 175);
				api.update({ reducedMotion: 'always', left: 250 });
				const reduced = api.snapshot();
				await api.nextFrame();
				await api.nextFrame();
				const later = api.snapshot();
				api.update({ left: 300 });
				const moved = api.snapshot();
				const completed = api.nextCompletion();
				api.update({ reducedMotion: 'never', left: 350 });
				const restored = api.snapshot();
				await completed;
				const finished = api.snapshot();
				api.update();
				return { reduced, later, moved, restored, finished, unchanged: api.snapshot() };
			});
			expectBox(state.reduced, { left: 250, top: 100, width: 100, height: 50 });
			expectBox(state.later, state.reduced);
			expectBox(state.moved, { left: 300, top: 100, width: 100, height: 50 });
			expectBox(state.restored, state.moved);
			expectBox(state.finished, { left: 350, top: 100, width: 100, height: 50 });
			expectBox(state.unchanged, state.finished);
		});

		it.each([
			{ name: 'a percentage author transform', transform: 'translateX(50%)', css: '' },
			{
				name: 'combined CSS rotation and nonuniform scale',
				transform: '',
				css: 'rotate: 45deg; scale: 2 .5;',
			},
		])('preserves $name while moving and resizing', async ({ transform, css }) => {
			if (css) await page.addStyleTag({ content: `.layout-box { ${css} }` });
			const state = await page.evaluate(async (transform) => {
				const api = window.layoutEdges;
				api.mount({ transform });
				const before = api.snapshot();
				// Let the browser resolve the authored transform at the new dimensions.
				const reference = document.createElement('div');
				reference.className = 'layout-box';
				Object.assign(reference.style, {
					position: 'absolute',
					left: '150px',
					top: '100px',
					width: '200px',
					height: '50px',
					transform,
				});
				api.target().parentElement!.append(reference);
				const { left, top, width, height } = reference.getBoundingClientRect();
				const expected = { left, top, width, height };
				reference.remove();
				const completed = api.nextCompletion();
				api.update({ left: 150, width: 200 });
				const start = api.snapshot();
				await completed;
				const finished = api.snapshot();
				api.update();
				return { before, start, expected, finished, unchanged: api.snapshot() };
			}, transform);
			expectBox(state.start, state.before);
			expectBox(state.finished, state.expected);
			expectBox(state.unchanged, state.expected);
		});

		it('preserves an external transform takeover during a layout animation', async () => {
			const state = await page.evaluate(async () => {
				const api = window.layoutEdges;
				api.mount({ origin: '0 0' });
				api.update({ left: 200 });
				await api.waitForLeftBetween(125, 175);
				api.target().style.setProperty('transform', 'translateX(30px)', 'important');
				const authored = api.snapshot();
				await api.nextFrame();
				await api.nextFrame();
				const later = api.snapshot();
				api.update();
				await api.nextFrame();
				await api.nextFrame();
				return { authored, later, unchanged: api.snapshot() };
			});
			for (const value of [state.authored, state.later, state.unchanged]) {
				expect(value.priority).toBe('important');
				expect(value.transform).toBe('translateX(30px)');
				expectBox(value, { left: 230, top: 100, width: 100, height: 50 });
			}
		});

		it('allows scrolling to clamp when an author takes over an active overflow transform', async () => {
			const state = await page.evaluate(async () => {
				const api = window.layoutEdges;
				api.mount({ scroll: true, left: 0, top: 0, height: 20, transform: 'translateX(200px)' });
				document.getElementById('layout-parent')!.scrollLeft = 200;
				api.update({ left: 100 });
				await api.waitForLeftBetween(25, 75);
				const moving = api.snapshot();
				api.target().style.setProperty('transform', 'none', 'important');
				const authored = api.snapshot();
				await api.nextFrame();
				await api.nextFrame();
				const later = api.snapshot();
				api.update();
				await api.nextFrame();
				await api.nextFrame();
				return { moving, authored, later, unchanged: api.snapshot() };
			});
			expect(state.moving.left).toBeGreaterThan(25);
			expect(state.moving.left).toBeLessThan(75);
			expect(state.moving.scrollLeft).toBe(200);
			for (const value of [state.authored, state.later, state.unchanged]) {
				expect(value.scrollLeft).toBe(100);
				expect(value.priority).toBe('important');
				expect(value.transform).toBe('none');
				expectBox(value, { left: 0, top: 0, width: 100, height: 20 });
			}
		});

		it('preserves scrolling while an active layout projection is the only source of overflow', async () => {
			const state = await page.evaluate(async () => {
				const api = window.layoutEdges;
				api.mount({ scroll: true, left: 200, top: 0, height: 20, origin: '0 0' });
				const completed = api.nextCompletion();
				api.update({ left: 0 });
				await api.waitForLeftBetween(125, 175);
				document.getElementById('layout-parent')!.scrollLeft = 80;
				const before = api.snapshot();
				api.update();
				const after = api.snapshot();
				await completed;
				const finished = api.snapshot();
				api.update();
				return { before, after, finished, unchanged: api.snapshot() };
			});
			expect(state.before.scrollLeft).toBe(80);
			expect(state.after.scrollLeft).toBe(80);
			expectBox(state.after, state.before);
			expect(state.finished.scrollLeft).toBe(0);
			expectBox(state.finished, { left: 0, top: 0, width: 100, height: 20 });
			expectBox(state.unchanged, state.finished);
		});
	});
}
