// @vitest-environment node

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { build as buildEsbuild, transformSync } from 'esbuild';
import { createOctaneCompiler } from 'octane/compiler/bundler';
import { octane } from 'octane/compiler/vite';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const packageDirectory = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageDirectory, '../..');
const consumerEntry = resolve(packageDirectory, 'tests/_fixtures/package-boundary-consumer.ts');
const consumerGlobal = '__OCTANE_ARIA_PACKAGE__';
const packageRequire = createRequire(resolve(packageDirectory, 'package.json'));
const testRunnerRequire = createRequire(packageRequire.resolve('vitest/package.json'));
const { JSDOM } = packageRequire('jsdom') as {
	JSDOM: new (
		html: string,
		options: { pretendToBeVisual: boolean; runScripts: 'dangerously'; url: string },
	) => { window: Window & typeof globalThis };
};

type ProductionBundler = 'esbuild' | 'compiled-esbuild' | 'vite';

interface ProductionBundle {
	code: string;
	modules: Array<string>;
}

const productionBundlers = ['esbuild', 'compiled-esbuild', 'vite'] as const;
const productionBundles = new Map<ProductionBundler, ProductionBundle>();
const productionBuildTimeout = 60_000;

async function buildConsumer(
	bundler: ProductionBundler,
	entry = consumerEntry,
	minify = true,
): Promise<ProductionBundle> {
	if (bundler === 'esbuild' || bundler === 'compiled-esbuild') {
		const compiler = createOctaneCompiler({ root: repositoryRoot });
		const result = await buildEsbuild({
			absWorkingDir: repositoryRoot,
			bundle: true,
			define: {
				__OCTANE_PROFILE_ENABLED__: 'false',
				'process.env.NODE_ENV': JSON.stringify('production'),
			},
			entryPoints: [entry],
			format: 'iife',
			globalName: consumerGlobal,
			logLevel: 'silent',
			metafile: true,
			minify,
			platform: 'browser',
			plugins:
				bundler === 'compiled-esbuild'
					? [
							{
								name: 'octane-authored-source',
								setup(build) {
									build.onLoad({ filter: /\.(?:tsrx|[jt]sx?)$/ }, ({ path: filename }) => {
										const result = compiler.transform(readFileSync(filename, 'utf8'), filename, {
											environment: 'client',
											hmr: false,
											dev: false,
											profile: false,
										});
										if (result === null || result.kind === 'none') return null;
										// Consume retained TypeScript syntax while preserving authored
										// value imports for the downstream JavaScript bundler.
										return {
											contents:
												result.kind === 'compile'
													? transformSync(result.code, {
															loader: 'tsx',
															tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: true } },
														}).code
													: result.code,
											loader:
												result.kind === 'compile'
													? 'js'
													: (extname(filename).slice(1) as 'ts' | 'tsx' | 'js'),
										};
									});
								},
							},
						]
					: [],
			target: 'esnext',
			treeShaking: true,
			write: false,
		});
		const output = Object.values(result.metafile!.outputs)[0];

		return {
			code: result.outputFiles[0].text,
			modules: Object.keys(output.inputs).map((module) => resolve(repositoryRoot, module)),
		};
	}

	const { build: buildVite } = await import(testRunnerRequire.resolve('vite'));
	const result = await buildVite({
		configFile: false,
		root: repositoryRoot,
		mode: 'production',
		logLevel: 'error',
		plugins: [octane({ hmr: false })],
		define: {
			__OCTANE_PROFILE_ENABLED__: 'false',
			'process.env.NODE_ENV': JSON.stringify('production'),
		},
		build: {
			write: false,
			minify: 'esbuild',
			target: 'esnext',
			lib: {
				entry,
				formats: ['iife'],
				name: consumerGlobal,
			},
		},
	});
	const outputs = Array.isArray(result) ? result : [result];
	const chunks = outputs.flatMap((output) =>
		output.output.filter((file: { type: string }) => file.type === 'chunk'),
	);

	expect(chunks).toHaveLength(1);
	expect(chunks[0].imports).toEqual([]);
	expect(chunks[0].dynamicImports).toEqual([]);

	return { code: chunks[0].code, modules: Object.keys(chunks[0].modules) };
}

beforeAll(async () => {
	for (const bundler of productionBundlers) {
		productionBundles.set(bundler, await buildConsumer(bundler));
	}
}, productionBuildTimeout);

function consumerBundle(bundler: ProductionBundler): ProductionBundle {
	const bundle = productionBundles.get(bundler);
	if (bundle === undefined) throw new Error(`Missing prepared ${bundler} production bundle.`);
	return bundle;
}

describe('@octanejs/aria package boundary', () => {
	it(
		'preserves all authored runtime entries in a compiled production esbuild bundle',
		async () => {
			const bundle = await buildConsumer(
				'compiled-esbuild',
				resolve(packageDirectory, 'tests/_fixtures/package-entries-consumer.ts'),
				false,
			);
			const context: Record<string, any> = {};
			runInNewContext(bundle.code, context);
			const { aria, stately, components } = context[consumerGlobal];
			for (const hook of ['useButton', 'useSeparator']) expect(typeof aria[hook]).toBe('function');
			expect(typeof stately.useListState).toBe('function');
			for (const component of ['Button', 'ComboBox', 'TokenField']) {
				expect(typeof components[component]).toBe('function');
			}
		},
		productionBuildTimeout,
	);

	it.each(productionBundlers)(
		'preserves public separator behavior and browser bootstrap in a production %s bundle',
		async (bundler) => {
			const bundle = consumerBundle(bundler);
			const dom = new JSDOM('<!doctype html><html><body></body></html>', {
				pretendToBeVisual: true,
				runScripts: 'dangerously',
				url: 'https://octane.test/',
			});
			const { window } = dom;
			const originalFocus = window.HTMLElement.prototype.focus;
			const documentListeners = vi.spyOn(window.document, 'addEventListener');
			const bodyListeners = vi.spyOn(window.document.body, 'addEventListener');
			const windowListeners = vi.spyOn(window, 'addEventListener');

			try {
				Object.defineProperty(window, 'PointerEvent', {
					configurable: true,
					value: window.MouseEvent,
				});
				const script = window.document.createElement('script');
				script.textContent = bundle.code;
				window.document.body.appendChild(script);
				window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

				const entry = (window as unknown as Record<string, { run: () => unknown }>)[consumerGlobal];
				expect(JSON.parse(JSON.stringify(entry.run()))).toEqual({
					id: 'aria-bundle-separator',
					'aria-label': 'Sections',
					role: 'separator',
					'aria-orientation': 'vertical',
				});
				expect(window.HTMLElement.prototype.focus).not.toBe(originalFocus);
				expect(documentListeners.mock.calls.map(([type]) => type)).toEqual(
					expect.arrayContaining([
						'keydown',
						'keyup',
						'click',
						'pointerdown',
						'pointermove',
						'pointerup',
					]),
				);
				expect(windowListeners.mock.calls.map(([type]) => type)).toEqual(
					expect.arrayContaining(['focus', 'blur']),
				);
				expect(bodyListeners.mock.calls.map(([type]) => type)).toEqual(
					expect.arrayContaining(['transitionrun', 'transitionend']),
				);
			} finally {
				windowListeners.mockRestore();
				bodyListeners.mockRestore();
				documentListeners.mockRestore();
				window.close();
			}
		},
	);

	it.each(productionBundlers)(
		'removes unrelated package-root exports from a production %s bundle',
		async (bundler) => {
			const { modules } = consumerBundle(bundler);
			const unwantedSiblings = [
				'focus/FocusScope.ts',
				'i18n/I18nProvider.ts',
				'numberfield/useNumberField.ts',
				'radio/useRadio.ts',
				'menu/useMenu.ts',
			];
			const leakedSiblings = unwantedSiblings.filter((sibling) =>
				modules.some((module) => module.endsWith(`/packages/aria/src/${sibling}`)),
			);

			expect(leakedSiblings).toEqual([]);
		},
	);

	it('preserves value-owned initialization in the separately imported stately and component entries', async () => {
		const result = await buildEsbuild({
			absWorkingDir: repositoryRoot,
			bundle: true,
			define: {
				__OCTANE_PROFILE_ENABLED__: 'false',
				'process.env.NODE_ENV': JSON.stringify('production'),
			},
			format: 'iife',
			// The components barrel contains compiler-authored TSX. Preserve unused JSX
			// until tree shaking rather than resolving Octane's type-only JSX entry.
			jsx: 'preserve',
			logLevel: 'silent',
			metafile: true,
			minify: true,
			platform: 'browser',
			stdin: {
				contents: `
import { Item } from '@octanejs/aria/stately';
import { DEFAULT_SLOT } from '@octanejs/aria/components';
globalThis.subentryResult = {
	collectionNode: typeof Item.getCollectionNode,
	defaultSlot: typeof DEFAULT_SLOT,
};
`,
				loader: 'ts',
				resolveDir: packageDirectory,
				sourcefile: 'aria-subentry-consumer.ts',
			},
			target: 'esnext',
			treeShaking: true,
			write: false,
		});
		const context: { subentryResult?: { collectionNode: string; defaultSlot: string } } = {};
		const modules = Object.keys(Object.values(result.metafile!.outputs)[0].inputs).map((module) =>
			resolve(repositoryRoot, module),
		);

		runInNewContext(result.outputFiles[0].text, context);

		expect(context.subentryResult).toEqual({ collectionNode: 'function', defaultSlot: 'symbol' });
		expect(modules).not.toContain(resolve(packageDirectory, 'src/index.ts'));
	});

	it('limits package bootstrap declarations to the root and genuinely effectful browser modules', () => {
		const manifest = JSON.parse(
			readFileSync(resolve(packageDirectory, 'package.json'), 'utf8'),
		) as {
			exports: Record<string, string>;
			sideEffects?: Array<string>;
		};

		expect(manifest.sideEffects).toEqual([
			'./src/index.ts',
			'./src/interactions/useFocusVisible.ts',
			'./src/utils/runAfterTransition.ts',
		]);
		expect(manifest.exports['./stately']).toBe('./src/stately/index.ts');
		expect(manifest.exports['./components']).toBe('./src/components/index.ts');
	});
});
