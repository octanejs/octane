// @vitest-environment node

import { relative, resolve, sep } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler/index.js';

describe('production component bundles', () => {
	it('drops a bare package-root import when no exports are used', async () => {
		const result = await build({
			stdin: {
				contents: `import 'octane'; export const marker = 'package-root-marker';`,
				loader: 'js',
				resolveDir: resolve(import.meta.dirname, '..'),
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
			relative(process.cwd(), resolve(import.meta.dirname, '../src'))
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
	});

	it('omits modules used only by a permanent-static boundary from the client bundle', async () => {
		const page = compile(
			`
import { Hydrate } from 'octane';
import { never } from 'octane/hydration';
import { StaticNavigation } from 'fixture:static-navigation';

export function App() @{
	<main data-bundle-probe="live-page">
		<Hydrate split={false} when={never()}>
			<StaticNavigation />
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
