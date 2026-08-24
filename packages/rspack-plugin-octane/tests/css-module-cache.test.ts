// @vitest-environment node

import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import rspack, { type Compiler, type Configuration, type RuleSetRule } from '@rspack/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { OctaneRspackPluginOptions } from '../types/index.js';
import {
	compile,
	configurationForFixture,
	createFixture,
	readBuild,
	serverModule,
	snapshotBuild,
	write,
	type CssBuildSnapshot,
	type CssOption,
	type CssProvider,
} from './_css-module-build.js';

const requireFixture = createRequire(import.meta.url);
const roots: string[] = [];
const classes = {
	root: 'mapped_root',
	label: 'mapped_label',
	tail: 'mapped_tail',
};
const unchangedProvider = `import './provider.css';
export const root = 'mapped_root';
export const label = 'mapped_label';
export const tail = 'mapped_tail';
export default { root, label, tail };`;
const freezeMap = `import styles from './styles.module.css';
Object.freeze(styles);`;
const mutateMap = `import styles from './styles.module.css';
styles.label = 'changed_label';
styles.tail = 'changed_tail';`;

function cacheFixture() {
	const root = createFixture({
		'App.tsrx': `import styles from './styles.module.css';
export function App() @{ <main class={styles.root}><span class={styles.label}>cache</span><i class={styles.tail} /></main> }`,
		'entry.js': `import './mutation.js';
import { renderToString } from 'octane/server';
import { App } from './App.tsrx';
import styles from './styles.module.css';
export function render() { return renderToString(App).html; }
export function isFrozen() { return Object.isFrozen(styles); }`,
		'mutation.js': freezeMap,
		'styles.module.css': '.unused{color:red}',
		'provider.css':
			'.mapped_root{color:red}.mapped_label{color:blue}.mapped_tail{color:green}.changed_label{color:purple}.changed_tail{color:orange}',
		'provider-loader.cjs': `module.exports = function () { return ${JSON.stringify(unchangedProvider)}; };`,
	});
	roots.push(root);
	// The entry deliberately retains this side-effect module. In the first
	// graph it freezes the map before App can run; the next graph may mutate it.
	write(
		root,
		'package.json',
		JSON.stringify({
			type: 'module',
			sideEffects: ['./mutation.js', '**/*.css'],
			dependencies: { octane: '*' },
		}),
	);
	const rules: RuleSetRule[] = [
		{
			test: /\.css$/,
			oneOf: [
				{
					test: /styles\.module\.css$/,
					type: 'javascript/auto',
					use: [join(root, 'provider-loader.cjs')],
				},
				{
					type: 'javascript/auto',
					use: [
						rspack.CssExtractRspackPlugin.loader,
						{ loader: requireFixture.resolve('css-loader'), options: { modules: false } },
					],
				},
			],
		},
	];
	return { root, rules };
}

function cachedConfiguration(
	fixture: ReturnType<typeof cacheFixture>,
	cssModuleConstants: CssOption,
	parallel: OctaneRspackPluginOptions['parallel'],
	plugins: NonNullable<Configuration['plugins']> = [],
) {
	return configurationForFixture(fixture.root, './entry.js', {
		server: true,
		cssModuleConstants,
		parallel,
		rules: fixture.rules,
		configuration: {
			name: 'octane-css-cache-fixture',
			cache: {
				type: 'persistent',
				version: 'css-cache-fixture-v1',
				// These inputs never change in this fixture. Make that public cache
				// contract explicit so incidental filesystem snapshots cannot turn the
				// regression into a fresh compile. mutation.js remains fully tracked.
				snapshot: {
					immutablePaths: [
						'App.tsrx',
						'entry.js',
						'package.json',
						'provider-loader.cjs',
						'provider.css',
						'styles.module.css',
					].map((file) => join(fixture.root, file)),
				},
				storage: { type: 'filesystem', directory: join(fixture.root, '.rspack-cache') },
			},
			output: { path: join(fixture.root, 'dist') },
			optimization: { minimize: false },
			plugins,
		},
	});
}

/** Close the real watcher and compiler so its persistent cache is flushed. */
async function watchOnce(configuration: Configuration): Promise<CssBuildSnapshot> {
	const compiler = rspack(configuration);
	return new Promise((resolve, reject) => {
		let finishing = false;
		compiler.watch({ aggregateTimeout: 0 }, (error, stats) => {
			if (finishing) return;
			finishing = true;
			let snapshot: CssBuildSnapshot | undefined;
			let failure: unknown = error;
			if (!failure) {
				try {
					if (!stats) throw new Error('Rspack watch completed without stats.');
					snapshot = snapshotBuild(stats);
				} catch (error) {
					failure = error;
				}
			}
			const closeCompiler = (watchError?: Error | null) => {
				compiler.close((closeError) => {
					if (failure || watchError || closeError) {
						return reject(failure ?? watchError ?? closeError);
					}
					resolve(snapshot!);
				});
			};
			if (compiler.watching) compiler.watching.close(closeCompiler);
			else closeCompiler();
		});
	});
}

function providerForFixture() {
	let asserted = true;
	const seen: string[] = [];
	const provider: CssProvider = ({ resource }) => {
		seen.push(resource);
		return asserted && resource.endsWith('/styles.module.css') ? { default: classes } : undefined;
	};
	return {
		provider,
		seen,
		withdraw() {
			asserted = false;
		},
	};
}

function expectRenderedClasses(output: ReturnType<typeof readBuild>, changed: boolean) {
	const module = serverModule(output);
	expect(module.isFrozen()).toBe(!changed);
	expect(module.render()).toBe(
		`<main class="mapped_root"><span class="${changed ? 'changed_label' : 'mapped_label'}">cache</span><i class="${changed ? 'changed_tail' : 'mapped_tail'}"></i></main>`,
	);
	expect(output.cssSource).toContain('.mapped_root');
	expect(output.cssSource).toContain('.changed_label');
}

const parallelModes = [
	['main thread', false],
	['workers', { maxWorkers: 2 }],
] satisfies Array<[string, OctaneRspackPluginOptions['parallel']]>;

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe.each(parallelModes)('CSS proof persistent cache on %s', (_name, parallel) => {
	it('discovers cached production-watch candidates in a later one-shot build', async () => {
		const fixture = cacheFixture();
		const { provider, seen } = providerForFixture();
		const firstPass: { present: boolean; built: boolean }[] = [];
		const observeCache = {
			apply(compiler: Compiler) {
				compiler.hooks.finishMake.tap(
					{ name: 'CssCacheFixture', stage: Number.MIN_SAFE_INTEGER },
					(compilation) => {
						const app = [...compilation.modules].find(
							(module) => module.nameForCondition?.() === join(fixture.root, 'App.tsrx'),
						);
						const built = new Set(
							[...compilation.builtModules].map((module) => module.identifier()),
						);
						firstPass.push({
							present: app !== undefined,
							built: app !== undefined && built.has(app.identifier()),
						});
					},
				);
			},
		};
		const watched = cachedConfiguration(fixture, provider, parallel, [observeCache]);
		expectRenderedClasses(
			readBuild(watched.directory, await watchOnce(watched.configuration)),
			false,
		);
		expect(seen).toEqual([]);

		const oneShot = cachedConfiguration(fixture, provider, parallel, [observeCache]);
		const output = readBuild(oneShot.directory, await compile(oneShot.configuration));
		expectRenderedClasses(output, false);
		// This public Rspack observation is the regression's cache-hit precondition:
		// a fresh first-pass compile would conceal lost discovery metadata.
		expect(firstPass).toEqual([
			{ present: true, built: true },
			{ present: true, built: false },
		]);
		expect(seen).toContain(join(fixture.root, 'styles.module.css'));
	}, 60_000);

	it.each(['withdrawn', 'disabled', 'watch'] as const)(
		'cannot reuse baked classes after the proof is %s',
		async (nextMode) => {
			const fixture = cacheFixture();
			const { provider, seen, withdraw } = providerForFixture();
			const first = cachedConfiguration(fixture, provider, parallel);
			expectRenderedClasses(readBuild(first.directory, await compile(first.configuration)), false);
			expect(seen).toContain(join(fixture.root, 'styles.module.css'));

			// Both App and the provider's completed ESM are byte-identical. Only a
			// different importer changes, and the SAME callback's closed-over lifetime
			// guarantee is withdrawn. Its source text is not a sufficient cache key.
			write(fixture.root, 'mutation.js', mutateMap);
			withdraw();
			seen.length = 0;
			const next = cachedConfiguration(
				fixture,
				nextMode === 'disabled' ? false : provider,
				parallel,
			);
			const stats =
				nextMode === 'watch'
					? await watchOnce(next.configuration)
					: await compile(next.configuration);
			expectRenderedClasses(readBuild(next.directory, stats), true);
			if (nextMode === 'withdrawn') {
				expect(seen).toContain(join(fixture.root, 'styles.module.css'));
			} else {
				expect(seen).toEqual([]);
			}
		},
		60_000,
	);
});
