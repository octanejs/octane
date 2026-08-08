// @vitest-environment node

import { createRequire } from 'node:module';
import { relative, resolve, sep } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/index.js';

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
	JSDOM: new (
		html: string,
		options: { runScripts: 'outside-only' },
	) => { window: Window & typeof globalThis };
};

async function evaluateProductionModule(source: string, filename: string) {
	const result = await build({
		stdin: {
			contents: compile(source, filename, { hmr: false, dev: false }).code,
			loader: 'js',
			resolveDir: resolve(import.meta.dirname, '../..'),
			sourcefile: filename.replace(/\.tsrx$/, '.js'),
		},
		bundle: true,
		define: {
			'process.env.NODE_ENV': JSON.stringify('production'),
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
		format: 'iife',
		logLevel: 'silent',
		minify: true,
		platform: 'browser',
		target: 'esnext',
		treeShaking: true,
		write: false,
	});
	const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
		runScripts: 'outside-only',
	});
	dom.window.eval(result.outputFiles[0].text);
	return dom.window;
}

describe('production component bundles', () => {
	it('keeps pre-root hydration capture independent of the DOM tables', async () => {
		const result = await build({
			stdin: {
				contents: `export { initializeHydrationEventCapture } from './src/hydration/index.ts';`,
				loader: 'js',
				resolveDir: resolve(import.meta.dirname, '../..'),
				sourcefile: 'hydration-capture-entry.js',
			},
			bundle: true,
			format: 'esm',
			logLevel: 'silent',
			metafile: true,
			treeShaking: false,
			write: false,
		});
		const inputs = Object.keys(result.metafile.inputs).map((input) => input.split(sep).join('/'));

		expect(inputs.some((input) => input.endsWith('/src/constants.ts'))).toBe(false);
		expect(inputs.some((input) => input.endsWith('/src/dom-tables.js'))).toBe(false);
	});

	it('drops a bare package-root import when no exports are used', async () => {
		const result = await build({
			stdin: {
				contents: `import 'octane'; export const marker = 'package-root-marker';`,
				loader: 'js',
				resolveDir: resolve(import.meta.dirname, '../..'),
				sourcefile: 'entry.js',
			},
			bundle: true,
			format: 'esm',
			logLevel: 'silent',
			metafile: true,
			minify: true,
			treeShaking: true,
			write: false,
		});
		const code = result.outputFiles[0].text;
		const output = Object.values(result.metafile.outputs)[0];
		const sourcePrefix =
			relative(process.cwd(), resolve(import.meta.dirname, '../../src'))
				.split(sep)
				.join('/') + '/';

		expect(code).toContain('package-root-marker');
		expect(Object.keys(output.inputs).filter((input) => input.startsWith(sourcePrefix))).toEqual(
			[],
		);
	});

	it('omits unused exported components and their templates', async () => {
		const components = compile(
			`
import { use } from 'octane';

export function UnusedDirect() @{
	<article data-bundle-probe="unused-direct-template" />
}

export function UnusedWithValue() @{
	const value = <aside data-bundle-probe="unused-value-template" />;
	<section>{value}</section>
}

export function UnusedWarm(props) @{
	const value = use(props.load(props.id));
	<div data-bundle-probe="unused-warm-template">{value as string}</div>
}

export function UnusedEventful() @{
	<button data-bundle-probe="unused-event-template" onAuxClick={() => {}} />
}

export function Retained() @{
	<main data-bundle-probe="retained-template" onClick={() => {}} />
}
`,
			'components.tsrx',
			{ hmr: false },
		).code;

		const result = await build({
			stdin: {
				contents: `export { Retained } from 'fixture:components';`,
				loader: 'js',
				sourcefile: 'entry.js',
			},
			bundle: true,
			format: 'esm',
			minify: true,
			treeShaking: true,
			write: false,
			external: ['octane'],
			plugins: [
				{
					name: 'compiled-components',
					setup(build) {
						build.onResolve({ filter: /^fixture:components$/ }, () => ({
							path: 'components.tsrx',
							namespace: 'fixture',
						}));
						build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
							contents: components,
							loader: 'js',
						}));
					},
				},
			],
		});
		const code = result.outputFiles[0].text;

		expect(code).toContain('retained-template');
		expect(code).not.toContain('unused-direct-template');
		expect(code).not.toContain('unused-value-template');
		expect(code).not.toContain('unused-warm-template');
		expect(code).not.toContain('unused-event-template');
		expect(code).not.toContain('auxclick');
		expect(code).toContain('click');
	});

	it('keeps only retained component events, scoped styles, and transition capabilities', async () => {
		const components = compile(
			`
import { ViewTransition } from 'octane';

export function Unused() @{
	<>
		<button class="unused-owner-style" onAuxClick={() => {}}>{'unused'}</button>
		<ViewTransition><aside>{'unused transition'}</aside></ViewTransition>
		<style>.unused-owner-style { color: rgb(255, 0, 0); }</style>
	</>
}

export function Retained() @{
	<button class="retained-owner-style" onClick={() => {
		globalThis.__octaneOwnerClicks = (globalThis.__octaneOwnerClicks || 0) + 1;
	}}>
		{'retained'}
		<style>.retained-owner-style { color: rgb(0, 0, 255); }</style>
	</button>
}
`,
			'owned-components.tsrx',
			{ hmr: false, dev: false },
		).code;
		const result = await build({
			stdin: {
				contents: `
import { createRoot } from 'octane';
import { Retained } from 'fixture:owned-components';
const container = document.createElement('div');
container.id = 'owned-component-root';
document.body.appendChild(container);
createRoot(container).render(Retained);
`,
				loader: 'js',
				resolveDir: resolve(import.meta.dirname, '../..'),
				sourcefile: 'owned-component-entry.js',
			},
			bundle: true,
			define: {
				'process.env.NODE_ENV': JSON.stringify('production'),
				__OCTANE_PROFILE_ENABLED__: 'false',
			},
			format: 'iife',
			logLevel: 'silent',
			minify: true,
			platform: 'browser',
			target: 'esnext',
			treeShaking: true,
			write: false,
			plugins: [
				{
					name: 'owned-components',
					setup(instance) {
						instance.onResolve({ filter: /^fixture:owned-components$/ }, () => ({
							path: 'owned-components.tsrx',
							namespace: 'owned-components',
						}));
						instance.onLoad({ filter: /.*/, namespace: 'owned-components' }, () => ({
							contents: components,
							loader: 'js',
							resolveDir: resolve(import.meta.dirname, '../..'),
						}));
					},
				},
			],
		});
		const code = result.outputFiles[0].text;
		expect(code).not.toContain('unused-owner-style');
		expect(code).not.toContain('startViewTransition');

		const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
			runScripts: 'outside-only',
		});
		const listeners: string[] = [];
		const addEventListener = dom.window.EventTarget.prototype.addEventListener;
		dom.window.EventTarget.prototype.addEventListener = function (
			this: EventTarget,
			type: string,
			listener: EventListenerOrEventListenerObject | null,
			options?: boolean | AddEventListenerOptions,
		) {
			if ((this as Element).id === 'owned-component-root') listeners.push(type);
			return addEventListener.call(this, type, listener, options);
		};
		dom.window.eval(code);

		const button = dom.window.document.querySelector('.retained-owner-style')!;
		expect(button.textContent?.trim()).toBe('retained');
		expect(listeners).toContain('click');
		expect(listeners).not.toContain('auxclick');
		expect(
			[...dom.window.document.querySelectorAll('style[data-octane]')].map((style) =>
				style.textContent?.includes('retained-owner-style'),
			),
		).toEqual([true]);
		button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
		expect((dom.window as Window & { __octaneOwnerClicks?: number }).__octaneOwnerClicks).toBe(1);
	});

	it('does not activate view transitions for an unused named import', () => {
		const result = compile(
			`import { ViewTransition as Transition } from 'octane';
export function Retained() @{ <main>{'retained'}</main> }`,
			'unused-transition.tsrx',
			{ hmr: false, dev: false },
		);

		expect(result.code).not.toContain('__vtSeen');
	});

	it('installs styles and delegated listeners before earlier authored module effects', async () => {
		const window = await evaluateProductionModule(
			`import { createRoot } from 'octane';
const container = document.createElement('div');
document.body.appendChild(container);
const listeners = [];
const originalAddEventListener = container.addEventListener.bind(container);
container.addEventListener = (type, listener, options) => {
	listeners.push({ type, capture: options === true || options?.capture === true });
	return originalAddEventListener(type, listener, options);
};
createRoot(container);
globalThis.__octaneBeforeComponent = {
	style: [...document.querySelectorAll('style[data-octane]')]
		.some((style) => style.textContent.includes('.timing')),
	bubble: listeners.some((listener) => listener.type === 'auxclick' && !listener.capture),
	capture: listeners.some((listener) => listener.type === 'pointerdown' && listener.capture),
};

export function StyledClickable() @{
	<button class="timing" onAuxClick={() => {}} onPointerDownCapture={() => {}}>
		<style>.timing { color: red; }</style>
	</button>
}

export function Plain() @{ <p /> }

globalThis.__octaneKeepStyled = StyledClickable;`,
			'effect-timing.tsrx',
		);

		expect(
			(
				window as Window & {
					__octaneBeforeComponent?: { style: boolean; bubble: boolean; capture: boolean };
				}
			).__octaneBeforeComponent,
		).toEqual({ style: true, bubble: true, capture: true });
	});

	it('preserves authored cascade order when component-owned and local styles coexist', async () => {
		const window = await evaluateProductionModule(
			`export function First() @{
	<>
		<div class="shared" />
		<style>:global(.shared) { color: red; }</style>
	</>
}

function Local() @{
	<>
		<div class="shared" />
		<style>:global(.shared) { color: blue; }</style>
	</>
}

export function Second() @{ <p /> }

globalThis.__octaneKeepComponents = [First, Local, Second];`,
			'mixed-style-order.tsrx',
		);

		const colors = [...window.document.querySelectorAll('style[data-octane]')].map((style) =>
			/color\s*:\s*red\b/.test(style.textContent ?? '') ? 'red' : 'blue',
		);
		expect(colors).toEqual(['red', 'blue']);
	});

	it('does not attribute an imported transition to a shadowing component parameter', async () => {
		const compiled = compile(
			`import { ViewTransition } from 'octane';
export function Unused() @{
	<ViewTransition><span>{'unused transition'}</span></ViewTransition>
}
export function Retained(ViewTransition) @{
	<main>{ViewTransition.label as string}</main>
}`,
			'shadowed-view-transition.tsrx',
			{ hmr: false, dev: false },
		).code;
		const result = await build({
			stdin: {
				contents: `import { Retained } from 'fixture:shadowed'; export { Retained };`,
				loader: 'js',
				resolveDir: resolve(import.meta.dirname, '../..'),
				sourcefile: 'shadowed-entry.js',
			},
			bundle: true,
			define: {
				'process.env.NODE_ENV': JSON.stringify('production'),
				__OCTANE_PROFILE_ENABLED__: 'false',
			},
			format: 'esm',
			logLevel: 'silent',
			minify: true,
			platform: 'browser',
			treeShaking: true,
			write: false,
			plugins: [
				{
					name: 'shadowed-view-transition',
					setup(instance) {
						instance.onResolve({ filter: /^fixture:shadowed$/ }, () => ({
							path: 'shadowed-view-transition.tsrx',
							namespace: 'shadowed',
						}));
						instance.onLoad({ filter: /.*/, namespace: 'shadowed' }, () => ({
							contents: compiled,
							loader: 'js',
							resolveDir: resolve(import.meta.dirname, '../..'),
						}));
					},
				},
			],
		});

		expect(result.outputFiles[0].text).not.toContain('startViewTransition');
	});

	it('omits modules reached only through permanent-static local wrappers', async () => {
		const page = compile(
			`
import { Hydrate } from 'octane';
import { never } from 'octane/hydration';
import { StaticNavigation } from 'fixture:static-navigation';

function StaticLeaf() @{
	<StaticNavigation />
}

function StaticShell() @{
	<StaticLeaf />
}

export function App() @{
	<main data-bundle-probe="live-page">
		<Hydrate split={false} when={never()}>
			<StaticShell />
		</Hydrate>
	</main>
}
`,
			'Page.tsrx',
			{ hmr: false },
		).code;
		const staticNavigation = compile(
			`
globalThis.__octanePermanentStaticModuleLoaded = true;

export function StaticNavigation() @{
	<nav data-bundle-probe="permanent-static-navigation" />
}
`,
			'StaticNavigation.tsrx',
			{ hmr: false },
		).code;

		const result = await build({
			stdin: {
				contents: `export { App } from 'fixture:page';`,
				loader: 'js',
				sourcefile: 'entry.js',
			},
			bundle: true,
			format: 'esm',
			minify: true,
			treeShaking: true,
			write: false,
			external: ['octane', 'octane/hydration'],
			plugins: [
				{
					name: 'permanent-static-fixtures',
					setup(build) {
						build.onResolve({ filter: /^fixture:/ }, (args) => ({
							path: args.path,
							namespace: 'fixture',
						}));
						build.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
							contents: args.path === 'fixture:page' ? page : staticNavigation,
							loader: 'js',
						}));
					},
				},
			],
		});
		const code = result.outputFiles[0].text;

		expect(code).toContain('live-page');
		expect(code).not.toContain('__octanePermanentStaticModuleLoaded');
		expect(code).not.toContain('permanent-static-navigation');
	});
});
