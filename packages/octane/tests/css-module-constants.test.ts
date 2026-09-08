// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { compile, type CompileOptions } from 'octane/compiler';
import styles, { badge, tail } from './_fixtures/css-module-constants.styles.js';
import { decodeMappings } from './_source-map.js';

const packageRoot = resolve(import.meta.dirname, '..');
const fixture = resolve(import.meta.dirname, '_fixtures/css-module-constants.tsrx');
const stylesheet = resolve(import.meta.dirname, '_fixtures/css-module-constants.styles.ts');
const source = readFileSync(fixture, 'utf8');
const request = './css-module-constants.styles.js';
const named: Readonly<Record<string, string>> = { badge, tail };

const proof: NonNullable<CompileOptions['resolveCssModuleConstant']> = (
	module,
	imported,
	property,
) => {
	if (module !== request) return undefined;
	if (imported === 'default' && property !== null && Object.hasOwn(styles, property)) {
		return styles[property as keyof typeof styles];
	}
	const name = imported === '*' ? property : property === null ? imported : null;
	return name !== null && Object.hasOwn(named, name) ? named[name] : undefined;
};

type FixtureModule = Record<string, any>;
type ProofMode = 'none' | 'full' | 'preserve';

async function bundleFixture(mode: 'client' | 'server', proofMode: ProofMode, dev: boolean) {
	const runtime = mode === 'client' ? 'octane' : 'octane/server';
	const exports = mode === 'client' ? 'createRoot, hydrateRoot, flushSync' : 'renderToString';
	const result = await build({
		stdin: {
			contents: `export * from ${JSON.stringify(fixture)};
export { ${exports} } from ${JSON.stringify(runtime)};
export { setMutableClass } from ${JSON.stringify(stylesheet)};`,
			loader: 'js',
			resolveDir: packageRoot,
			sourcefile: 'css-constants-entry.js',
		},
		bundle: true,
		write: false,
		format: mode === 'client' ? 'iife' : 'esm',
		...(mode === 'client' ? { globalName: 'cssFixture' } : {}),
		platform: mode === 'client' ? 'browser' : 'node',
		target: 'esnext',
		minify: !dev,
		logLevel: 'silent',
		define: {
			'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
		plugins: [
			{
				name: 'compile-css-constant-fixture',
				setup(bundler) {
					bundler.onLoad({ filter: /\.tsrx$/ }, ({ path }) => {
						if (path !== fixture) return undefined;
						return {
							contents: compile(source, fixture, {
								mode,
								hmr: false,
								dev,
								...(proofMode === 'none' ? {} : { resolveCssModuleConstant: proof }),
								...(proofMode === 'preserve' ? { preserveCssModuleReferences: [request] } : {}),
							}).code,
							loader: 'js',
							resolveDir: resolve(fixture, '..'),
						};
					});
				},
			},
		],
	});
	return result.outputFiles[0].text;
}

function clientModule(code: string) {
	const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
		runScripts: 'outside-only',
		url: 'https://example.test/',
	});
	dom.window.eval(code);
	return {
		dom,
		api: (dom.window as unknown as { cssFixture: FixtureModule }).cssFixture,
		container: dom.window.document.getElementById('root')!,
	};
}

let serverModuleId = 0;
async function serverModule(code: string): Promise<FixtureModule> {
	return import(
		`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#css-${serverModuleId++}`
	);
}

function props(label = 'First') {
	return {
		label,
		selected: 'root',
		attrs: { class: 'from-spread' },
		shadow: 'shadow-first',
		rows: [
			{ id: 'a', root: 'row-a' },
			{ id: 'b', root: 'row-b' },
		],
		onClick: vi.fn(),
		ref: { current: null as HTMLElement | null },
	};
}

function observed(container: Element) {
	return Array.from(
		container.querySelectorAll('main, h1, p, div[data-case], aside, li, button'),
	).map((element) => [element.tagName, element.getAttribute('class'), element.textContent]);
}

describe('proven CSS-module class strings', () => {
	for (const dev of [false, true]) {
		it(`preserves classes, spread ordering, events, and keyed updates (${dev ? 'dev' : 'prod'})`, async () => {
			const bundles = await Promise.all([
				bundleFixture('client', 'none', dev),
				bundleFixture('client', 'full', dev),
				bundleFixture('client', 'preserve', dev),
			]);
			const results = [];
			for (const code of bundles) {
				const { dom, api, container } = clientModule(code);
				const initial = props();
				const root = api.createRoot(container);
				try {
					root.render(api.CssConstants, initial);
					api.flushSync(() => {});
					const main = container.querySelector('main');
					const rowA = container.querySelector('li');
					expect(main?.className).toBe(styles.root);
					expect(container.querySelector('h1')?.className).toBe(`${badge} ${tail}`);
					expect(container.querySelector('[data-case="escaped"]')?.getAttribute('class')).toBe(
						styles.escaped,
					);
					expect(container.querySelector('[data-case="empty"]')?.getAttribute('class')).toBe('');
					expect(initial.ref.current).toBe(main);
					(container.querySelector('button') as HTMLButtonElement).click();
					expect(initial.onClick).toHaveBeenCalledOnce();
					const first = observed(container);
					api.setMutableClass('_mutable_second');
					api.flushSync(() =>
						root.render(api.CssConstants, {
							...initial,
							label: 'Second',
							selected: 'tail',
							attrs: { className: 'next-spread' },
							shadow: 'shadow-second',
							rows: [initial.rows[1], initial.rows[0]],
						}),
					);
					expect(container.querySelector('main')).toBe(main);
					expect(container.querySelectorAll('li')[1]).toBe(rowA);
					expect(container.querySelector('[data-case="mutable"]')?.className).toBe(
						'_mutable_second',
					);
					expect(container.querySelector('[data-case="computed"]')?.className).toBe(tail);
					expect(container.querySelector('[data-case="shadow"]')?.className).toBe('shadow-second');
					results.push([first, observed(container)]);
				} finally {
					root.unmount();
					expect(initial.ref.current).toBeNull();
					expect(container.textContent).toBe('');
					dom.window.close();
				}
			}
			expect(results[1]).toEqual(results[0]);
			expect(results[2]).toEqual(results[0]);
		});

		it(`hydrates existing DOM and keeps later dynamic reads live (${dev ? 'dev' : 'prod'})`, async () => {
			const [serverControl, serverCandidate, serverPreserved, ...clients] = await Promise.all([
				bundleFixture('server', 'none', dev).then(serverModule),
				bundleFixture('server', 'full', dev).then(serverModule),
				bundleFixture('server', 'preserve', dev).then(serverModule),
				bundleFixture('client', 'none', dev),
				bundleFixture('client', 'full', dev),
				bundleFixture('client', 'preserve', dev),
			]);
			const html = serverCandidate.renderToString(serverCandidate.CssConstants, props()).html;
			expect(html).toBe(serverControl.renderToString(serverControl.CssConstants, props()).html);
			expect(html).toBe(serverPreserved.renderToString(serverPreserved.CssConstants, props()).html);
			for (const code of clients) {
				const { dom, api, container } = clientModule(code);
				container.innerHTML = html;
				const initial = props();
				const main = container.querySelector('main');
				const button = container.querySelector('button');
				const root = api.hydrateRoot(container, api.CssConstants, initial);
				try {
					api.flushSync(() => {});
					expect(container.querySelector('main')).toBe(main);
					expect(container.querySelector('button')).toBe(button);
					expect(container.querySelector('[data-case="empty"]')?.getAttribute('class')).toBe('');
					expect(initial.ref.current).toBe(main);
					(button as HTMLButtonElement).click();
					expect(initial.onClick).toHaveBeenCalledOnce();
					api.setMutableClass('_after_hydration');
					api.flushSync(() => root.render(api.CssConstants, { ...initial, label: 'Hydrated' }));
					expect(container.querySelector('h1')?.textContent).toBe('Hydrated');
					expect(container.querySelector('[data-case="mutable"]')?.className).toBe(
						'_after_hydration',
					);
				} finally {
					root.unmount();
					expect(initial.ref.current).toBeNull();
					dom.window.close();
				}
			}
		});
	}

	it('retains original source locations and rejects non-string proof values', () => {
		const result = compile(source, fixture, {
			hmr: false,
			resolveCssModuleConstant: proof,
			inspect: true,
		});
		expect(result.map.sourcesContent).toContain(source);
		const classOffset = source.indexOf('class={styles.root}') + 'class={'.length;
		const classLine = source.slice(0, classOffset).split('\n').length - 1;
		expect(
			decodeMappings(result.map.mappings)
				.flat()
				.some((segment) => segment[2] === classLine),
		).toBe(true);
		expect(() =>
			compile(source, fixture, {
				resolveCssModuleConstant: (() => 123) as unknown as typeof proof,
			}),
		).toThrow('Invalid CSS-module constant');
	});

	it('does not borrow a proof across import attributes', () => {
		const resolveCssModuleConstant = vi.fn(() => '_wrong_module');
		compile(
			'import styles from "./sheet.module.css" with { type: "css" }; ' +
				'export function App() @{ <div class={styles.root}/> }',
			'/ImportAttributes.tsrx',
			{ hmr: false, resolveCssModuleConstant },
		);
		expect(resolveCssModuleConstant).not.toHaveBeenCalled();
	});
});
