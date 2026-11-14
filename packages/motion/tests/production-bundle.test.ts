// @vitest-environment node

import { createRequire } from 'node:module';
import { resolve, sep } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

interface BrowserRealm {
	window: Window & {
		eval(source: string): unknown;
		close(): void;
	};
}

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
	JSDOM: new (
		markup: string,
		options: { runScripts: 'dangerously'; pretendToBeVisual: boolean },
	) => BrowserRealm;
};
const packageDirectory = resolve(import.meta.dirname, '..');

describe('@octanejs/motion public production imports', () => {
	it('runs the selected animation without retaining unused Octane motion bindings', async () => {
		const result = await build({
			stdin: {
				contents: `
import { animate } from '@octanejs/motion';

const element = document.getElementById('animated');
const controls = animate(element, { opacity: 0.25 }, {
	duration: 0,
});
globalThis.animationCompleted = new Promise((resolve) => {
	controls.then(() => {
		resolve({
			opacity: element.style.opacity,
			stoppable: typeof controls.stop === 'function',
		});
	});
});
`,
				resolveDir: packageDirectory,
				sourcefile: 'public-motion-consumer.ts',
			},
			bundle: true,
			define: {
				__OCTANE_PROFILE_ENABLED__: 'false',
				'process.env.NODE_ENV': JSON.stringify('production'),
			},
			format: 'iife',
			logLevel: 'silent',
			metafile: true,
			minify: true,
			platform: 'browser',
			treeShaking: true,
			write: false,
		});
		const browser = new JSDOM('<!doctype html><div id="animated"></div>', {
			runScripts: 'dangerously',
			pretendToBeVisual: true,
		});

		try {
			browser.window.eval(result.outputFiles[0].text);

			const snapshot = await (
				browser.window as typeof browser.window & {
					animationCompleted: Promise<{ opacity: string; stoppable: boolean }>;
				}
			).animationCompleted;
			expect(snapshot).toEqual({ opacity: '0.25', stoppable: true });
		} finally {
			browser.window.close();
		}

		const includedModules = Object.entries(Object.values(result.metafile!.outputs)[0].inputs)
			.filter(([, input]) => input.bytesInOutput > 0)
			.map(([module]) => module.split(sep).join('/'));
		const unusedBindings = includedModules.filter((module) =>
			/(?:^|\/)packages\/motion\/src\/(?:context|useSpring)\.ts$/.test(module),
		);

		expect(unusedBindings).toEqual([]);
	});

	it('tracks SVG attribute MotionValues alongside CSS transforms and stops retired writes', async () => {
		const result = await build({
			stdin: {
				contents: `
import { createElement as h, createRoot, flushSync } from 'octane';
import { motion, motionValue } from '@octanejs/motion';
import { frame } from 'motion-dom';

const root = createRoot(document.getElementById('root'));
const cx = motionValue(5);
const x = motionValue(3);
const cssX = motionValue(2);
const strokeWidth = motionValue(2);
const viewBox = motionValue('0 0 20 20');
const hidden = motionValue(false);
const replacement = motionValue(21);
const render = (center, extras = true) => flushSync(() =>
	root.render(h(motion.svg, { viewBox }, h(motion.circle, {
		...(center === undefined ? {} : { cx: center }),
		cy: 8,
		...(extras ? { x, strokeWidth, 'aria-hidden': hidden, style: { x: cssX } } : {}),
		animate: { opacity: 0.5 },
		transition: { duration: 0 },
	}))),
);
const afterRender = () => new Promise(resolve => frame.postRender(() => resolve()));

render(cx);
const svg = document.querySelector('svg');
const circle = svg.querySelector('circle');
const center = () => circle.getAttribute('cx');

globalThis.svgMotionValues = (async () => {
	const initial = [center(), circle.getAttribute('x'), svg.getAttribute('viewBox'), circle.getAttribute('aria-hidden')];
	cx.set('25%');
	x.set(11);
	cssX.set(8);
	strokeWidth.set(5);
	hidden.set(true);
	viewBox.set('0 0 40 40');
	await afterRender();
	const updated = [
		center(),
		circle.getAttribute('x'),
		circle.style.transform,
		circle.getAttribute('stroke-width'),
		svg.getAttribute('viewBox'),
		circle.getAttribute('opacity'),
		circle.getAttribute('aria-hidden'),
	];

	cx.set(19);
	render(replacement);
	await afterRender();
	const replaced = center();
	replacement.set(22);
	await afterRender();
	const rebound = center();

	render(replacement, false);
	frame.postRender(() => render(22, false));
	replacement.set(23);
	await afterRender();
	replacement.set(24);
	await afterRender();
	const staticTakeover = center();

	render(replacement, false);
	frame.postRender(() => render(undefined, false));
	replacement.set(25);
	await afterRender();
	replacement.set(26);
	await afterRender();
	const removed = center();
	const reused = circle === svg.querySelector('circle');

	render(cx);
	frame.postRender(() => root.unmount());
	cx.set(27);
	await afterRender();
	return { initial, updated, replaced, rebound, staticTakeover, removed, reused, detached: center() };
})();
`,
				resolveDir: packageDirectory,
				sourcefile: 'public-motion-svg-consumer.ts',
			},
			bundle: true,
			define: {
				__OCTANE_PROFILE_ENABLED__: 'false',
				'process.env.NODE_ENV': JSON.stringify('production'),
			},
			format: 'iife',
			logLevel: 'silent',
			minify: true,
			platform: 'browser',
			write: false,
		});
		const browser = new JSDOM('<!doctype html><div id="root"></div>', {
			runScripts: 'dangerously',
			pretendToBeVisual: true,
		});

		try {
			browser.window.eval(result.outputFiles[0].text);
			expect(
				await (browser.window as typeof browser.window & { svgMotionValues: Promise<unknown> })
					.svgMotionValues,
			).toEqual({
				initial: ['5', '3', '0 0 20 20', 'false'],
				updated: ['25%', '11', 'translateX(8px)', '5', '0 0 40 40', '0.5', 'true'],
				replaced: '21',
				rebound: '22',
				staticTakeover: '22',
				removed: null,
				reused: true,
				detached: '19',
			});
		} finally {
			browser.window.close();
		}
	});

	it('enforces strict LazyMotion in a development browser bundle without a process global', async () => {
		const result = await build({
			stdin: {
				contents: `
import { createElement, createRoot } from 'octane';
import { domMax, LazyMotion, motion } from '@octanejs/motion';

try {
	createRoot(document.getElementById('root')).render(LazyMotion, {
		features: domMax,
		strict: true,
		children: createElement(motion.div, { id: 'strict-motion' }),
	});
	globalThis.strictMotionError = null;
} catch (error) {
	globalThis.strictMotionError = error instanceof Error ? error.message : String(error);
}
`,
				resolveDir: packageDirectory,
				sourcefile: 'strict-lazy-motion-consumer.ts',
			},
			bundle: true,
			define: {
				__OCTANE_PROFILE_ENABLED__: 'false',
				'process.env.NODE_ENV': JSON.stringify('development'),
			},
			format: 'iife',
			logLevel: 'silent',
			platform: 'browser',
			write: false,
		});
		const browser = new JSDOM('<!doctype html><div id="root"></div>', {
			runScripts: 'dangerously',
			pretendToBeVisual: true,
		});

		try {
			expect('process' in browser.window).toBe(false);
			browser.window.eval(result.outputFiles[0].text);

			expect(
				(browser.window as typeof browser.window & { strictMotionError: string | null })
					.strictMotionError,
			).toEqual(expect.stringContaining('strict `LazyMotion`'));
		} finally {
			browser.window.close();
		}
	});
});
