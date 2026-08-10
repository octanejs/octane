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

interface ProductionChunk {
	type: 'chunk';
	code: string;
	modules: Record<string, { renderedLength: number }>;
}

interface ProductionBuildOutput {
	output: Array<ProductionChunk | { type: 'asset' }>;
}

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom') as {
	JSDOM: new (
		markup: string,
		options: { runScripts: 'dangerously'; pretendToBeVisual: boolean },
	) => BrowserRealm;
};
const packageDirectory = resolve(import.meta.dirname, '..');
const consumerEntry = resolve(import.meta.dirname, '_fixtures/production-bundle-consumer.ts');
const productionDefines = {
	__OCTANE_PROFILE_ENABLED__: 'false',
	'process.env.NODE_ENV': JSON.stringify('production'),
};

function verifySeparator(code: string): void {
	const browser = new JSDOM('<!doctype html><div id="root"></div>', {
		runScripts: 'dangerously',
		pretendToBeVisual: true,
	});

	try {
		browser.window.eval(code);

		const separator = browser.window.document.querySelector('#selected-separator');
		expect(separator?.getAttribute('role')).toBe('separator');
		expect(separator?.getAttribute('aria-orientation')).toBe('vertical');
	} finally {
		browser.window.close();
	}
}

function unrelatedComponents(modules: string[]): string[] {
	return modules.filter((module) =>
		/(?:^|\/)packages\/base-ui\/src\/(?:dialog|popover)\.ts$/.test(module),
	);
}

describe('@octanejs/base-ui public production imports', () => {
	it('renders the selected Separator without retaining unrelated component modules', async () => {
		const result = await build({
			entryPoints: [consumerEntry],
			bundle: true,
			define: productionDefines,
			format: 'iife',
			logLevel: 'silent',
			metafile: true,
			minify: true,
			platform: 'browser',
			treeShaking: true,
			write: false,
		});
		verifySeparator(result.outputFiles[0].text);

		const includedModules = Object.entries(Object.values(result.metafile!.outputs)[0].inputs)
			.filter(([, input]) => input.bytesInOutput > 0)
			.map(([module]) => module.split(sep).join('/'));

		expect(unrelatedComponents(includedModules)).toEqual([]);
	});

	it('preserves Separator behavior and component pruning in a Vite production build', async () => {
		const resolveVitestDependency = createRequire(require.resolve('vitest'));
		const { build: buildWithVite } = (await import(resolveVitestDependency.resolve('vite'))) as {
			build: (
				options: Record<string, unknown>,
			) => Promise<ProductionBuildOutput | Array<ProductionBuildOutput>>;
		};
		const result = await buildWithVite({
			configFile: false,
			root: packageDirectory,
			mode: 'production',
			logLevel: 'silent',
			define: productionDefines,
			build: {
				write: false,
				minify: 'esbuild',
				target: 'esnext',
				lib: {
					entry: consumerEntry,
					formats: ['iife'],
					name: 'BaseUiProductionConsumer',
				},
			},
		});
		const bundles = (Array.isArray(result) ? result : [result]).flatMap((output) =>
			output.output.filter((entry): entry is ProductionChunk => entry.type === 'chunk'),
		);

		expect(bundles).toHaveLength(1);
		verifySeparator(bundles[0].code);

		const includedModules = Object.entries(bundles[0].modules)
			.filter(([, module]) => module.renderedLength > 0)
			.map(([module]) => module.split(sep).join('/'));

		expect(unrelatedComponents(includedModules)).toEqual([]);
	});
});
