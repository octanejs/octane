// @vitest-environment node

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { build as buildEsbuild } from 'esbuild';
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

type ProductionBundler = 'esbuild' | 'vite';

interface ProductionBundle {
	code: string;
	modules: Array<string>;
}

const productionBundlers = ['esbuild', 'vite'] as const;
const productionBundles = new Map<ProductionBundler, ProductionBundle>();

async function buildConsumer(bundler: ProductionBundler): Promise<ProductionBundle> {
	if (bundler === 'esbuild') {
		const result = await buildEsbuild({
			absWorkingDir: repositoryRoot,
			bundle: true,
			define: {
				__OCTANE_PROFILE_ENABLED__: 'false',
				'process.env.NODE_ENV': JSON.stringify('production'),
			},
			entryPoints: [consumerEntry],
			format: 'iife',
			globalName: consumerGlobal,
			logLevel: 'silent',
			metafile: true,
			minify: true,
			platform: 'browser',
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
				entry: consumerEntry,
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
});

function consumerBundle(bundler: ProductionBundler): ProductionBundle {
	const bundle = productionBundles.get(bundler);
	if (bundle === undefined) throw new Error(`Missing prepared ${bundler} production bundle.`);
	return bundle;
}

describe('@octanejs/aria package boundary', () => {
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
