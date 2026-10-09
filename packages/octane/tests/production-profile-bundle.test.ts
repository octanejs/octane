// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseSync } from 'vite';
import { createRequire } from 'node:module';
import { resolve, sep } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { foldProfileGuards } = require('../src/compiler/profile-guards.js') as {
	foldProfileGuards(
		source: string,
		program: ReturnType<typeof parseSync>['program'],
		enabled: boolean,
	): string | null;
};
const { compile } = require('octane/compiler') as {
	compile(
		source: string,
		filename: string,
		options: { dev: boolean; hmr: boolean; profile: boolean },
	): { code: string };
};
const { JSDOM } = require('jsdom') as {
	JSDOM: new (
		html: string,
		options: { runScripts: 'outside-only' },
	) => {
		window: Window &
			typeof globalThis & {
				__OCTANE_DEVTOOLS__?: { getTree(): Array<{ name: string }> };
				__OCTANE_PROFILER__?: {
					snapshot(): { build: string; renderers: string[]; counters: Record<string, number> };
				};
			};
	};
};

async function buildCustomEsbuildApp(
	profile: boolean,
	fixture?: string,
	compilerProfile = profile,
) {
	const source = compile(
		fixture ??
			`import { createRoot } from 'octane';
		function ProfileConsumer() @{
			<button id="profile-consumer">{'ready'}</button>
		}
		createRoot(document.getElementById('app')).render(ProfileConsumer);`,
		'custom-esbuild-profile.tsrx',
		{ dev: false, hmr: false, profile: compilerProfile },
	).code;
	const result = await build({
		stdin: {
			contents: source,
			loader: 'js',
			resolveDir: resolve(import.meta.dirname, '..'),
			sourcefile: 'custom-esbuild-profile.js',
		},
		bundle: true,
		define: {
			'process.env.NODE_ENV': JSON.stringify('production'),
			__OCTANE_PROFILE_ENABLED__: JSON.stringify(profile),
		},
		format: 'iife',
		logLevel: 'silent',
		metafile: true,
		minify: true,
		platform: 'browser',
		target: 'esnext',
		treeShaking: true,
		write: false,
	});
	const output = result.outputFiles[0];
	const retainedInputs = Object.entries(Object.values(result.metafile.outputs)[0].inputs)
		.filter(([, metadata]) => metadata.bytesInOutput > 0)
		.map(([input]) => input.split(sep).join('/'));
	const dom = new JSDOM('<!doctype html><div id="app"></div>', {
		runScripts: 'outside-only',
	});
	dom.window.eval(output.text);

	return {
		dom,
		retainedInputs,
	};
}

describe('custom esbuild production profiling', () => {
	it('keeps instrumentation out of normal production apps while preserving an explicit profiling build', async () => {
		const normal = await buildCustomEsbuildApp(false);
		const profiled = await buildCustomEsbuildApp(true);

		expect(normal.dom.window.document.querySelector('#profile-consumer')?.textContent).toBe(
			'ready',
		);
		expect(profiled.dom.window.document.querySelector('#profile-consumer')?.textContent).toBe(
			'ready',
		);
		expect(normal.dom.window.__OCTANE_DEVTOOLS__).toBeUndefined();
		expect(profiled.dom.window.__OCTANE_DEVTOOLS__?.getTree()).toEqual([
			expect.objectContaining({ name: 'ProfileConsumer' }),
		]);
		// Engine counters ride the same define: present in the production profiling
		// build, which commits its first render synchronously, and absent otherwise.
		expect(normal.dom.window.__OCTANE_PROFILER__).toBeUndefined();
		expect(profiled.dom.window.__OCTANE_PROFILER__?.snapshot()).toMatchObject({
			build: 'production',
			renderers: ['dom'],
			counters: { 'commit.root': 1, 'rollback.root': 0, 'component.render': 1 },
		});

		for (const optionalModule of ['/src/profiling.ts', '/src/devtools-hook.ts']) {
			expect(normal.retainedInputs.some((input) => input.endsWith(optionalModule))).toBe(false);
			expect(profiled.retainedInputs.some((input) => input.endsWith(optionalModule))).toBe(true);
		}
	});
});

// Keep identifiers: adding a dead import can reorder a minifier's short names.
// The ordinary gate compares DCE with source-level erasure. For a profiling-only
// change, OCTANE_PROFILE_STRIP_BASE also compares against a pinned Git baseline,
// while holding the compiler, dependencies, paths, and all build inputs fixed.
describe('profiling-disabled code identity', () => {
	const root = resolve(import.meta.dirname, '../../..');
	const erasedSources = new Map<string, string>();
	const entries = [
		'packages/octane/src/index.ts',
		'packages/octane/src/universal.ts',
		...['root-static', 'hooks-state', 'context', 'hydrate-root', 'suspense-transition'].map(
			(name) => `benchmarks/bundle-size/fixtures/minimal/${name}.tsrx`,
		),
		...['js-framework', 'todomvc', 'chat-stream'].map(
			(name) => `benchmarks/${name}/octane-tsrx/src/main.js`,
		),
	];
	it.each(['development', 'production'])(
		'erases every probe in %s builds',
		async (mode) => {
			for (const entry of entries) {
				async function bundle(reference: boolean) {
					const result = await build({
						absWorkingDir: root,
						entryPoints: [entry],
						bundle: true,
						write: false,
						format: 'esm',
						platform: 'browser',
						target: 'esnext',
						minifySyntax: true,
						minifyWhitespace: true,
						minifyIdentifiers: false,
						legalComments: 'none',
						treeShaking: true,
						logLevel: 'silent',
						metafile: true,
						define: {
							'process.env.NODE_ENV': JSON.stringify(mode),
							__OCTANE_PROFILE_ENABLED__: 'false',
						},
						plugins: [
							{
								name: 'profile-erased-reference',
								setup(builder) {
									builder.onLoad({ filter: /\.tsrx$/ }, ({ path }) => {
										let code = compile(readFileSync(path, 'utf8'), path, {
											dev: mode === 'development',
											hmr: false,
											profile: false,
										}).code;
										if (reference) {
											const { program, errors } = parseSync(path, code, {
												lang: 'js',
												sourceType: 'module',
												preserveParens: true,
											});
											expect(errors).toEqual([]);
											code = foldProfileGuards(code, program, false) ?? code;
										}
										return { contents: code, loader: 'js' };
									});
									if (!reference) return;
									builder.onLoad({ filter: /packages\/octane\/src\/.*\.[jt]s$/ }, ({ path }) => {
										const loader = path.endsWith('.ts') ? 'ts' : 'js';
										let contents = erasedSources.get(path);
										if (contents === undefined) {
											const baseline = process.env.OCTANE_PROFILE_STRIP_BASE;
											const source = baseline
												? execFileSync(
														'git',
														['show', `${baseline}:${path.slice(root.length + 1)}`],
														{ cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
													)
												: readFileSync(path, 'utf8');
											const { program, errors } = parseSync(path, source, {
												lang: loader,
												sourceType: 'module',
												preserveParens: true,
											});
											expect(errors).toEqual([]);
											contents = foldProfileGuards(source, program, false) ?? source;
											erasedSources.set(path, contents);
										}
										return { contents, loader };
									});
								},
							},
						],
					});
					for (const output of Object.values(result.metafile!.outputs))
						for (const [path, input] of Object.entries(output.inputs))
							if (path.endsWith('/profiling.ts')) expect(input.bytesInOutput).toBe(0);
					return result.outputFiles![0].text;
				}
				expect(await bundle(false), `${mode}: ${entry}`).toBe(await bundle(true));
			}
		},
		60_000,
	);
});

// Profile compilation intentionally disables autoMemo. Independently compiled
// production dependencies can still execute against a profiling runtime.
it('counts an optimized dependency cache hit only when the region was skipped', async () => {
	const { dom } = await buildCustomEsbuildApp(
		true,
		`
		import { createRoot } from 'octane';
		function Child(props) @{ <ul>@for (const row of props.items; key row) { <li>{row as string}</li> }</ul> }
		function Parent(props) @{ <div><Child items={props.items} /><b>{String(props.tick)}</b></div> }
		const root = createRoot(document.getElementById('app'));
		const items = ['kept'];
		root.render(Parent, { items, tick: 0 });
		globalThis.mountCounters = globalThis.__OCTANE_PROFILER__.counters();
		root.render(Parent, { items, tick: 1 });
	`,
		false,
	);
	expect((dom.window as any).mountCounters['block.cacheHit']).toBe(0);
	expect(dom.window.__OCTANE_PROFILER__!.snapshot().counters['block.cacheHit']).toBeGreaterThan(0);
	expect(dom.window.document.getElementById('app')!.textContent).toBe('kept1');
});
