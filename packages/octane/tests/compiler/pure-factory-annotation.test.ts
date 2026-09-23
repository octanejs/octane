// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { createOctaneCompiler } from '../../src/compiler/bundler.js';

// Octane's factories declare `/* @__NO_SIDE_EFFECTS__ */`, which Rollup honors
// across modules and esbuild deliberately does not: its tree-shaking decisions
// are local to the calling file. An unused module-scope `createContext(…)`
// therefore used to retain the entire client runtime in esbuild bundles. The
// compiler owns the fix, so these suites bundle compiler output with esbuild
// and assert what the bundle contains and what it does.

const packageRoot = resolve(import.meta.dirname, '../..');
const fixtures = resolve(import.meta.dirname, '../_fixtures/pure-factories');
const runtimeModule = /(?:^|\/)src\/runtime(?:\.server)?\.ts$/;

async function bundle(entry: string, environment: 'client' | 'server') {
	const compiler = createOctaneCompiler({ root: packageRoot });
	const result = await build({
		stdin: { contents: entry, loader: 'ts', resolveDir: fixtures, sourcefile: 'entry.ts' },
		absWorkingDir: packageRoot,
		bundle: true,
		conditions: environment === 'server' ? ['node'] : [],
		define: { 'process.env.NODE_ENV': JSON.stringify('production') },
		format: 'esm',
		logLevel: 'silent',
		metafile: true,
		minify: true,
		platform: environment === 'server' ? 'node' : 'browser',
		target: 'esnext',
		treeShaking: true,
		write: false,
		plugins: [
			{
				name: 'octane-source',
				setup(bundler) {
					bundler.onLoad({ filter: /\.(?:tsrx|[jt]sx?)$/ }, ({ path: filename }) => {
						const out = compiler.transform(readFileSync(filename, 'utf8'), filename, {
							environment,
							hmr: false,
							dev: false,
							profile: false,
						});
						if (out === null || out.kind === 'none') return null;
						return { contents: out.code, loader: filename.endsWith('.tsrx') ? 'js' : 'ts' };
					});
				},
			},
		],
	});
	const [output] = Object.values(result.metafile.outputs);
	const modules = Object.entries(output.inputs)
		.filter(([, input]) => input.bytesInOutput > 0)
		.map(([id]) => id);
	const code = result.outputFiles[0].text;
	const exports = (await import(
		`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
	)) as Record<string, unknown>;
	return { modules, exports };
}

// Each build loads and tree-shakes the full runtime source.
describe('esbuild tree-shakes unused octane factory results', { timeout: 60_000 }, () => {
	it.each([
		['a hook-free plain module', 'unused-context.ts', 'double', 6],
		['a hook-slotted plain module', 'unused-context-hook.ts', 'triple', 9],
		['a memo-inlined plain module', 'unused-context-memo.ts', 'quintuple', 15],
		['a compiled .tsrx module', 'unused-factories.tsrx', 'quadruple', 12],
	])('client bundle of %s omits the runtime', async (_, file, helper, expected) => {
		const { modules, exports } = await bundle(
			`export { ${helper} as run } from './${file}';\n`,
			'client',
		);
		expect((exports.run as (value: number) => number)(3)).toBe(expected);
		expect(modules.filter((id) => runtimeModule.test(id))).toEqual([]);
	});

	it('client bundle keeps the runtime once the context is used', async () => {
		// Semantic control: the omission above is tree-shaking, not a runtime that
		// never entered the graph.
		const { modules, exports } = await bundle(
			"export { UnusedContext as run } from './unused-context.ts';\n",
			'client',
		);
		expect(typeof exports.run).toBe('function');
		expect(modules.some((id) => runtimeModule.test(id))).toBe(true);
	});

	it('server bundle drops the module behind an unused lazy()', async () => {
		const { modules, exports } = await bundle(
			"export { sextuple as run } from './unused-lazy.tsrx';\n",
			'server',
		);
		expect((exports.run as (value: number) => number)(3)).toBe(18);
		expect(modules.filter((id) => id.endsWith('heavy-client.ts'))).toEqual([]);
	});

	it('a local that shadows a factory import keeps its side effects', async () => {
		const { exports } = await bundle(
			"export { recordCalls as run } from './shadowed-factory.ts';\n",
			'client',
		);
		expect((exports.run as () => string[])()).toEqual(['shadowed call ran']);
	});
});
