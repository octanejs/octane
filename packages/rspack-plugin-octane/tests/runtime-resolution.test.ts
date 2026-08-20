import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import rspack, { type Compiler, type Configuration } from '@rspack/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OctaneRspackPlugin } from '../src/index.js';
import type { OctaneRspackPluginOptions } from '../types/index.js';

const requireFixture = createRequire(import.meta.url);

interface Identity {
	origin: string;
}

interface RuntimeObservation {
	runtime: Identity;
	client: Identity;
	server: Identity;
	internalServer: Identity;
	profiling: Identity;
}

interface ConditionalRuntime {
	identity: Identity;
	condition: string;
}

const observeRuntime = `
import { identity as runtime } from 'octane';
import { identity as client } from 'octane/internal/client';
import { identity as server } from 'octane/server';
import { identity as internalServer } from 'octane/internal/server';
import { identity as profiling } from 'octane/profiling';
export const observed = { runtime, client, server, internalServer, profiling };
`;

function write(root: string, relativePath: string, content: string) {
	const filename = join(root, relativePath);
	mkdirSync(dirname(filename), { recursive: true });
	writeFileSync(filename, content);
	return filename;
}

function writePackage(root: string, manifest: Record<string, unknown>) {
	write(root, 'package.json', JSON.stringify(manifest) + '\n');
}

function installRuntime(
	directory: string,
	origin: string,
	{ name = 'octane', conditional = false } = {},
) {
	const entry = (environment: 'client' | 'server') => ({
		...(conditional
			? {
					'fixture-runtime': `./esm/${environment}-custom.mjs`,
					browser: `./esm/${environment}-browser.mjs`,
				}
			: {}),
		import: `./esm/${environment}.mjs`,
		require: `./cjs/${environment}.cjs`,
	});
	writePackage(directory, {
		name,
		type: 'module',
		main: './esm/client.mjs',
		module: './esm/client.mjs',
		exports: {
			'.': entry('client'),
			'./server': entry('server'),
			'./internal/client': './esm/internal-client.mjs',
			'./internal/server': './esm/internal-server.mjs',
			'./profiling': './esm/profiling.mjs',
			'./universal': './esm/universal.mjs',
			'./compiler': './esm/compiler.mjs',
		},
	});
	for (const environment of ['client', 'server'] as const) {
		write(
			directory,
			`esm/${environment}.mjs`,
			`export const identity = { origin: ${JSON.stringify(`${origin}:${environment}:import`)} };\nexport const condition = 'import';\n`,
		);
		write(
			directory,
			`cjs/${environment}.cjs`,
			`exports.identity = { origin: ${JSON.stringify(`${origin}:${environment}:require`)} };\nexports.condition = 'require';\n`,
		);
		write(
			directory,
			`esm/internal-${environment}.mjs`,
			`export { identity } from './${environment}.mjs';\n`,
		);
		if (conditional) {
			for (const condition of ['browser', 'custom']) {
				write(
					directory,
					`esm/${environment}-${condition}.mjs`,
					`export { identity } from './${environment}.mjs';\nexport const condition = ${JSON.stringify(condition)};\n`,
				);
			}
		}
	}
	write(directory, 'esm/profiling.mjs', "export { identity } from './client.mjs';\n");
	for (const subpath of ['universal', 'compiler']) {
		write(
			directory,
			`esm/${subpath}.mjs`,
			`export const marker = ${JSON.stringify(`${origin}:${subpath}`)};\n`,
		);
	}
	return directory;
}

async function compile(config: Configuration) {
	const compiler = rspack(config);
	await new Promise<void>((resolve, reject) => {
		compiler.run((error, stats) => {
			compiler.close((closeError) => {
				if (error || closeError) {
					reject(error ?? closeError);
					return;
				}
				if (!stats) {
					reject(new Error('Rspack completed without stats.'));
					return;
				}
				if (stats.hasErrors()) {
					const errors = stats.toJson({ all: false, errors: true }).errors ?? [];
					reject(new Error(errors.map((entry) => entry.message ?? String(entry)).join('\n')));
					return;
				}
				resolve();
			});
		});
	});
}

function load<T>(directory: string, entry = 'main'): T {
	return requireFixture(join(directory, `${entry}.cjs`)) as T;
}

function expectRuntime(
	observed: RuntimeObservation,
	origin: string,
	environment: 'client' | 'server',
) {
	expect(observed.client.origin).toBe(`${origin}:client:import`);
	expect(observed.server.origin).toBe(`${origin}:server:import`);
	expect(observed.internalServer).toBe(observed.server);
	expect(observed.profiling).toBe(observed.client);
	expect(observed.runtime).toBe(observed[environment]);
}

function expectSharedRuntime(
	observed: RuntimeObservation,
	application: RuntimeObservation,
	origin: string,
	environment: 'client' | 'server',
) {
	expectRuntime(observed, origin, environment);
	expect(observed.client).toBe(application.client);
	expect(observed.server).toBe(application.server);
}

describe('Rspack runtime package resolution', () => {
	let sandbox: string;
	let root: string;
	let buildNumber: number;

	beforeEach(() => {
		sandbox = mkdtempSync(join(tmpdir(), 'octane-rspack-resolution-'));
		root = join(sandbox, 'application');
		buildNumber = 0;
		writePackage(root, {
			name: 'runtime-resolution-fixture',
			private: true,
			type: 'module',
			dependencies: { octane: '*' },
		});
	});

	afterEach(async () => {
		await rm(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
	});

	async function build(
		options: OctaneRspackPluginOptions | false = {},
		config: Configuration = {},
	) {
		const directory = join(root, `dist-${++buildNumber}`);
		const { output, plugins = [], ...rest } = config;
		await compile({
			context: root,
			mode: 'production',
			target: 'web',
			entry: './entry.mjs',
			devtool: false,
			optimization: { minimize: false, splitChunks: false, runtimeChunk: false },
			...rest,
			output: {
				path: directory,
				filename: '[name].cjs',
				library: { type: 'commonjs2' },
				...output,
			},
			plugins: [
				...(options === false ? [] : [new OctaneRspackPlugin({ parallel: false, ...options })]),
				...plugins,
			],
		});
		return directory;
	}

	function installLinkedRuntimeObserver() {
		const linked = join(sandbox, 'linked-package');
		writePackage(root, {
			name: 'runtime-resolution-fixture',
			private: true,
			type: 'module',
			dependencies: { octane: '*', '@fixture/linked': '*' },
		});
		writePackage(linked, {
			name: '@fixture/linked',
			type: 'module',
			exports: './index.mjs',
			dependencies: { octane: '*' },
		});
		write(linked, 'index.mjs', observeRuntime);
		installRuntime(join(linked, 'node_modules/octane'), 'nested');
		mkdirSync(join(root, 'node_modules/@fixture'), { recursive: true });
		symlinkSync(linked, join(root, 'node_modules/@fixture/linked'), 'dir');
		write(root, 'observe.mjs', observeRuntime);
		write(
			root,
			'entry.mjs',
			"export { observed as application } from './observe.mjs';\nexport { observed as linked } from '@fixture/linked';\n",
		);
	}

	it.each([
		['browser defaults', {}, 'browser'],
		['custom conditions', { conditionNames: ['fixture-runtime', '...'] }, 'custom'],
		[
			'ESM-specific conditions',
			{ byDependency: { esm: { conditionNames: ['fixture-runtime', '...'] } } },
			'custom',
		],
	] satisfies Array<[string, NonNullable<Configuration['resolve']>, string]>)(
		'uses finalized %s for a conditional runtime',
		async (_label, resolve, expected) => {
			installRuntime(join(root, 'node_modules/octane'), 'application', { conditional: true });
			write(root, 'entry.mjs', "export { identity, condition } from 'octane';\n");
			const output = load<ConditionalRuntime>(await build({}, { resolve }));
			expect(output.identity.origin).toBe('application:client:import');
			expect(output.condition).toBe(expected);
		},
	);

	it('uses configured application module roots for the shared runtime', async () => {
		installRuntime(join(root, 'node_modules/octane'), 'ordinary');
		const selectedModules = join(sandbox, 'selected-modules');
		installRuntime(join(selectedModules, 'octane'), 'selected');
		write(root, 'entry.mjs', observeRuntime);
		const { observed } = load<{ observed: RuntimeObservation }>(
			await build({}, { resolve: { modules: [selectedModules, 'node_modules'] } }),
		);
		expectRuntime(observed, 'selected', 'client');
	});

	it.each([
		['web', 'client'],
		['node', 'server'],
	] as const)(
		'shares the selected runtime across linked packages for %s',
		async (target, environment) => {
			installRuntime(join(root, 'node_modules/octane'), 'application');
			installLinkedRuntimeObserver();
			const output = load<{ application: RuntimeObservation; linked: RuntimeObservation }>(
				await build({}, { target }),
			);
			expectRuntime(output.application, 'application', environment);
			expectSharedRuntime(output.linked, output.application, 'application', environment);
		},
	);

	it.each([
		{ target: 'web', environment: 'client', scope: 'top-level' },
		{ target: 'node', environment: 'server', scope: 'top-level' },
		{ target: 'web', environment: 'client', scope: 'ESM-specific' },
		{ target: 'node', environment: 'server', scope: 'ESM-specific' },
	] as const)(
		'anchors the $target graph to an application-selected $scope package alias',
		async ({ target, environment, scope }) => {
			installRuntime(join(root, 'node_modules/octane'), 'ordinary');
			const selected = installRuntime(join(sandbox, 'selected-octane'), 'selected');
			installLinkedRuntimeObserver();
			const alias = { octane$: join(selected, 'esm/client.mjs') };
			const resolve = scope === 'top-level' ? { alias } : { byDependency: { esm: { alias } } };
			const output = load<{ application: RuntimeObservation; linked: RuntimeObservation }>(
				await build({}, { target, resolve }),
			);
			expectRuntime(output.application, 'selected', environment);
			expectSharedRuntime(output.linked, output.application, 'selected', environment);
		},
	);

	it('preserves exact helper overrides and unrelated subpaths beside a broad package alias', async () => {
		installRuntime(join(root, 'node_modules/octane'), 'ordinary');
		const selected = installRuntime(join(sandbox, 'selected-octane'), 'selected');
		const client = write(
			sandbox,
			'overrides/client.mjs',
			"export const identity = { origin: 'explicit-client' };\n",
		);
		const profiling = write(
			sandbox,
			'overrides/profiling.mjs',
			"export const identity = { origin: 'explicit-profiling' };\n",
		);
		for (const subpath of ['universal', 'compiler']) {
			write(
				selected,
				`${subpath}.js`,
				`export const marker = ${JSON.stringify(`broad-alias:${subpath}`)};\n`,
			);
		}
		write(
			root,
			'entry.mjs',
			observeRuntime +
				"export { marker as universal } from 'octane/universal';\nexport { marker as compiler } from 'octane/compiler';\n",
		);
		const output = load<{
			observed: RuntimeObservation;
			universal: string;
			compiler: string;
		}>(
			await build(
				{},
				{
					resolve: {
						alias: {
							octane: selected,
							'octane/internal/client$': client,
							'octane/profiling$': profiling,
						},
					},
				},
			),
		);
		expect(output.observed.runtime.origin).toBe('selected:client:import');
		expect(output.observed.client.origin).toBe('explicit-client');
		expect(output.observed.profiling.origin).toBe('explicit-profiling');
		expect(output.observed.server.origin).toBe('selected:server:import');
		expect(output.observed.internalServer).toBe(output.observed.server);
		expect(output.universal).toBe('broad-alias:universal');
		expect(output.compiler).toBe('broad-alias:compiler');
	});

	it('preserves absolute and conditional-package runtime overrides', async () => {
		installRuntime(join(root, 'node_modules/octane'), 'application');
		installRuntime(join(root, 'node_modules/@fixture/runtime'), 'override', {
			name: '@fixture/runtime',
			conditional: true,
		});
		const absolute = write(
			sandbox,
			'absolute-runtime.mjs',
			"export const identity = { origin: 'absolute-runtime' };\nexport const condition = 'absolute';\n",
		);
		write(root, 'entry.mjs', observeRuntime + "export { condition } from 'octane';\n");
		for (const [runtime, origin, condition] of [
			[absolute, 'absolute-runtime', 'absolute'],
			['@fixture/runtime', 'override:client:import', 'browser'],
		]) {
			const output = load<{ observed: RuntimeObservation; condition: string }>(
				await build({ runtime }),
			);
			expect(output.observed.runtime.origin).toBe(origin);
			expect(output.condition).toBe(condition);
			expect(output.observed.client.origin).toBe('application:client:import');
			expect(output.observed.profiling).toBe(output.observed.client);
			expect(output.observed.server.origin).toBe('application:server:import');
			expect(output.observed.internalServer).toBe(output.observed.server);
		}
	});

	it.each(['top-level', 'ESM-specific'] as const)(
		'preserves an ignored %s runtime alias',
		async (scope) => {
			installRuntime(join(root, 'node_modules/octane'), 'application');
			write(
				root,
				'entry.mjs',
				"import * as runtime from 'octane';\nexport const ignored = !('identity' in runtime);\nexport { identity as client } from 'octane/internal/client';\n",
			);
			const alias = { octane$: false as const };
			const resolve = scope === 'top-level' ? { alias } : { byDependency: { esm: { alias } } };
			const output = load<{ ignored: boolean; client: Identity }>(await build({}, { resolve }));
			expect(output.ignored).toBe(true);
			expect(output.client.origin).toBe('application:client:import');
		},
	);

	it('preserves ESM-wide alias opt-outs and native resolution behavior', async () => {
		installRuntime(join(root, 'node_modules/octane'), 'application');
		const dependency = join(root, 'node_modules/unrelated-alias');
		writePackage(dependency, {
			name: 'unrelated-alias',
			type: 'module',
			exports: './index.mjs',
		});
		write(dependency, 'index.mjs', "export const marker = 'package';\n");
		const replacement = write(root, 'replacement.mjs', "export const marker = 'alias';\n");
		write(root, 'entry.mjs', "export { marker } from 'unrelated-alias';\n");
		const resolveOptions = (): NonNullable<Configuration['resolve']> => ({
			alias: { 'unrelated-alias': replacement },
			byDependency: { esm: { alias: false } },
		});
		const reference = load<{ marker: string }>(await build(false, { resolve: resolveOptions() }));
		let configuredAlias: unknown;
		const output = load<{ marker: string }>(
			await build(
				{},
				{
					resolve: resolveOptions(),
					plugins: [
						{
							apply(compiler: Compiler) {
								compiler.hooks.initialize.tap('InspectAliasOptOut', () => {
									configuredAlias = compiler.options.resolve.byDependency?.esm?.alias;
								});
							},
						},
					],
				},
			),
		);
		expect(configuredAlias).toBe(false);
		expect(output.marker).toBe(reference.marker);
	});

	it.each(['ordinary', 'ESM-selected'] as const)(
		'retains layer-specific universal runtime overrides with an %s application runtime',
		async (selection) => {
			const application = installRuntime(join(root, 'node_modules/octane'), 'application');
			for (const name of ['background', 'main']) {
				installRuntime(join(root, `node_modules/@fixture/${name}-runtime`), name, {
					name: `@fixture/${name}-runtime`,
					conditional: true,
				});
				write(root, `${name}.mjs`, "export * from './layered.mjs';\n");
			}
			write(
				root,
				'layered.mjs',
				"export { identity, condition } from 'octane';\nexport { marker as universal } from 'octane/universal';\n",
			);
			const output = await build(
				{
					runtime: '@fixture/background-runtime',
					universalRuntime: { runtime: 'object', thread: 'background' },
					layerSpecializations: {
						'octane:main-thread': {
							runtime: '@fixture/main-runtime',
							universalRuntime: { runtime: 'object', thread: 'main-thread' },
						},
					},
				},
				{
					...(selection === 'ESM-selected'
						? {
								resolve: {
									byDependency: {
										esm: { alias: { octane$: join(application, 'esm/client.mjs') } },
									},
								},
							}
						: {}),
					entry: {
						background: { import: './background.mjs', layer: 'octane:background' },
						main: { import: './main.mjs', layer: 'octane:main-thread' },
					},
				},
			);
			for (const name of ['background', 'main']) {
				const result = load<ConditionalRuntime & { universal: string }>(output, name);
				expect(result.identity.origin).toBe(`${name}:client:import`);
				expect(result.condition).toBe('browser');
				expect(result.universal).toBe('application:universal');
			}
		},
	);
});
