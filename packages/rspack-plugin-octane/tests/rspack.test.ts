import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import rspack from '@rspack/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getOctaneRspackBuildInfo, OctaneRspackPlugin } from '../src/index.js';

const repositoryRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const profilerGlobal = '__OCTANE_PROFILER__';
const runGlobal = '__octane_rspack_profile_bundle_runs__';

function write(root: string, relativePath: string, content: string) {
	const file = join(root, relativePath);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
	return file;
}

function runtimeSource(marker: string) {
	return `
globalThis.${marker} = true;
module.exports = new Proxy({}, {
	get(_target, name) {
		if (name === 'template') return (html) => html;
		return (...args) => args[0];
	},
});
`;
}

async function compile(config: Record<string, unknown>) {
	const compiler = rspack(config as any) as any;
	return new Promise<any>((resolve, reject) => {
		compiler.run((error: Error | null, stats: any) => {
			compiler.close((closeError: Error | null) => {
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
					reject(new Error(errors.map((entry: any) => entry.message ?? String(entry)).join('\n')));
					return;
				}
				resolve(stats);
			});
		});
	});
}

describe('programmatic Rspack integration', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'octane-rspack-build-'));
		write(
			root,
			'package.json',
			JSON.stringify({
				name: 'rspack-fixture',
				private: true,
				dependencies: { octane: '*', '@fixture/raw': '*' },
			}) + '\n',
		);
		write(
			root,
			'node_modules/octane/package.json',
			JSON.stringify({
				name: 'octane',
				exports: {
					'.': './client.cjs',
					'./server': './server.cjs',
					'./profiling': './profiling.cjs',
				},
			}) + '\n',
		);
		write(root, 'node_modules/octane/client.cjs', runtimeSource('__octane_client_runtime__'));
		write(root, 'node_modules/octane/server.cjs', runtimeSource('__octane_server_runtime__'));
		write(root, 'node_modules/octane/profiling.cjs', runtimeSource('__octane_profiling_runtime__'));
		write(
			root,
			'node_modules/@fixture/raw/package.json',
			JSON.stringify({
				name: '@fixture/raw',
				exports: './index.tsx',
				dependencies: { octane: '*' },
			}) + '\n',
		);
		write(
			root,
			'node_modules/@fixture/raw/node_modules/octane/package.json',
			JSON.stringify({
				name: 'octane',
				exports: { './profiling': './profiling.cjs' },
			}) + '\n',
		);
		write(
			root,
			'node_modules/@fixture/raw/node_modules/octane/profiling.cjs',
			runtimeSource('__octane_nested_profiling_runtime__'),
		);
		write(
			root,
			'node_modules/@fixture/raw/index.tsx',
			`export function Raw() { return <span data-probe="raw-binding-output">raw</span>; }\n`,
		);
		write(
			root,
			'node_modules/@fixture/object-renderer/package.json',
			JSON.stringify({
				name: '@fixture/object-renderer',
				type: 'module',
				exports: './index.js',
			}) + '\n',
		);
		write(
			root,
			'node_modules/@fixture/object-renderer/index.js',
			`export const rendererGraphMarker = 'client-object-renderer';
export const defineUniversalComponent = (_renderer, component) => component;
export const universalPlan = (_renderer, plan) => plan;
export const universalValue = (plan) => plan;
export const universalComponent = () => null;
export const universalProps = (value) => value;
export const universalIf = () => null;
export const universalSwitch = () => null;
export const universalFor = () => null;
export const universalTry = () => null;
export const universalChildren = (value) => value;
export const universalContext = () => null;
export const universalActivity = () => null;
export const rendererRegion = (_owner, _child, body) => body;
export const warmChild = () => undefined;
`,
		);
		write(
			root,
			'node_modules/@fixture/object-boundaries/package.json',
			JSON.stringify({
				name: '@fixture/object-boundaries',
				type: 'module',
				exports: './index.js',
			}) + '\n',
		);
		write(
			root,
			'node_modules/@fixture/object-boundaries/index.js',
			'export function Canvas(props) { return props.children; }\n',
		);
		write(
			root,
			'src/App.tsrx',
			`import { useState } from 'octane';

export function App() @{
	const [value] = useState('app');
	<main data-probe="local-tsrx">{value as string}</main>
}
`,
		);
		write(
			root,
			'src/index.js',
			`export { App } from './App.tsrx';\nexport { Raw } from '@fixture/raw';\n`,
		);
	});

	afterEach(() => {
		Reflect.deleteProperty(globalThis, profilerGlobal);
		Reflect.deleteProperty(globalThis, runGlobal);
		rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
	});

	function installRealProfileFixture(includeRawBinding: boolean) {
		rmSync(join(root, 'node_modules/octane'), { recursive: true, force: true });
		symlinkSync(join(repositoryRoot, 'packages/octane'), join(root, 'node_modules/octane'), 'dir');
		write(
			root,
			'src/ProfileBundleProbe.tsrx',
			`import { memo, useState } from 'octane';

const MemoLeaf = memo(function MemoLeaf(props: { value: number }) {
	return <span>{props.value as string}</span>;
});

export function ProfileBundleProbe() @{
	const [count] = useState(0);
	<MemoLeaf value={count} />
}
`,
		);
		write(
			root,
			'src/index.js',
			`import { ProfileBundleProbe } from './ProfileBundleProbe.tsrx';

globalThis.${runGlobal} = (globalThis.${runGlobal} || 0) + 1;
export { ProfileBundleProbe };
${includeRawBinding ? "export { Raw } from '@fixture/raw';" : ''}
`,
		);
	}

	async function buildRealRuntime(
		profile: boolean,
		target: 'web' | 'node' = 'web',
		includeRawBinding = false,
	) {
		installRealProfileFixture(includeRawBinding);
		const mode = `${target}-${profile ? 'profile' : 'normal'}`;
		const outputPath = join(root, `dist-real-${mode}`);
		await compile({
			context: root,
			mode: 'production',
			target,
			entry: './src/index.js',
			resolve: { extensionAlias: { '.js': ['.ts', '.js'] } },
			optimization: { minimize: true },
			output: { path: outputPath, filename: 'bundle.cjs' },
			plugins: [new OctaneRspackPlugin({ profile })],
		});
		const file = join(outputPath, 'bundle.cjs');
		return { code: readFileSync(file, 'utf8'), file };
	}

	it('builds client and server graphs with maps, raw dependencies, and one target runtime', async () => {
		for (const [environment, target, runtimeMarker, absentMarker] of [
			['client', 'web', '__octane_client_runtime__', '__octane_server_runtime__'],
			['server', 'node', '__octane_server_runtime__', '__octane_client_runtime__'],
		] as const) {
			const outputPath = join(root, `dist-${environment}`);
			await compile({
				context: root,
				mode: 'development',
				target,
				entry: './src/index.js',
				devtool: 'source-map',
				optimization: { minimize: false },
				output: { path: outputPath, filename: 'bundle.js' },
				plugins: [new OctaneRspackPlugin()],
			});

			const bundle = readFileSync(join(outputPath, 'bundle.js'), 'utf8');
			expect(bundle).toContain(runtimeMarker);
			expect(bundle).not.toContain(absentMarker);
			expect(bundle).toContain('local-tsrx');
			expect(bundle).toContain('raw-binding-output');
			const map = JSON.parse(readFileSync(join(outputPath, 'bundle.js.map'), 'utf8'));
			expect(map.sources.some((source: string) => source.includes('src/App.tsrx'))).toBe(true);
			expect(map.sources.some((source: string) => source.includes('@fixture/raw/index.tsx'))).toBe(
				true,
			);
		}
	}, 30_000);

	it('splits client-only renderer dependencies from the raw server graph with stable module identity', async () => {
		write(
			root,
			'src/object-renderer.js',
			readFileSync(join(root, 'node_modules/@fixture/object-renderer/index.js'), 'utf8'),
		);
		const scene = write(
			root,
			'src/Scene.object.tsrx',
			`import './scene-setup.js';
export const metadata = 'authored-client-metadata';
export default function Scene() @{ <group><mesh /></group> }
`,
		);
		const sceneSetup = write(
			root,
			'src/scene-setup.js',
			`globalThis.__octane_client_only_setup__ = 'authored-scene-setup';\n`,
		);
		write(
			root,
			'src/App.tsrx',
			`import { Canvas } from '@fixture/object-boundaries';
import './Scene.object.tsrx';
import Scene from './Scene.object.tsrx';
export function App() @{ <main><Canvas><Scene /></Canvas><p>after</p></main> }
`,
		);
		write(root, 'src/index.js', `export { App } from './App.tsrx';\n`);

		const renderers = {
			registry: {
				object: {
					module: '/src/object-renderer.js',
					server: 'client-only' as const,
				},
			},
			boundaries: {
				'@fixture/object-boundaries': {
					Canvas: {
						ownerRenderer: 'dom',
						childRenderer: 'object',
						prop: 'children',
						server: 'omit-child' as const,
					},
				},
			},
			rules: [{ include: 'src/**/*.object.tsrx', renderer: 'object' }],
		};
		const build = async (environment: 'client' | 'server') => {
			const outputPath = join(root, `dist-client-only-${environment}`);
			const stats = await compile({
				context: root,
				mode: 'development',
				target: environment === 'client' ? 'web' : 'node',
				entry: './src/index.js',
				optimization: { minimize: false },
				output: { path: outputPath, filename: 'bundle.js' },
				plugins: [new OctaneRspackPlugin({ renderers })],
			});
			return {
				bundle: readFileSync(join(outputPath, 'bundle.js'), 'utf8'),
				manifest: existsSync(join(outputPath, 'octane-client-references.json'))
					? JSON.parse(readFileSync(join(outputPath, 'octane-client-references.json'), 'utf8'))
					: null,
				// Snapshot native module wrappers before the compiler is collected.
				modules: [...stats.compilation.modules].map((item: any) => ({
					buildInfo: JSON.parse(JSON.stringify(item.buildInfo ?? {})),
					identifier: item.identifier?.(),
					resource: item.resource ?? item.nameForCondition?.(),
				})),
			};
		};

		const client = await build('client');
		const server = await build('server');
		const moduleFor = (modules: any[], resource: string) =>
			modules.find((item) => item.resource === resource || item.identifier?.includes(resource));
		const clientScene = moduleFor(client.modules, scene);
		const serverScene = moduleFor(server.modules, scene);
		const clientInfo = getOctaneRspackBuildInfo(clientScene)!;
		const serverInfo = getOctaneRspackBuildInfo(serverScene)!;
		const clientReference = clientInfo?.clientReference;

		expect(clientInfo).toMatchObject({
			transformKind: 'compile',
			clientReference: {
				moduleId: '/src/Scene.object.tsrx',
				renderer: 'object',
			},
		});
		expect(serverInfo).toMatchObject({
			transformKind: 'client-only-stub',
			clientReference,
		});
		expect(client.manifest).toEqual({
			version: 1,
			references: {
				[clientReference.id]: {
					moduleId: clientReference.moduleId,
					renderer: clientReference.renderer,
					chunks: ['bundle.js'],
				},
			},
		});
		expect(server.manifest).toBeNull();
		expect(moduleFor(client.modules, sceneSetup)).toBeDefined();
		expect(moduleFor(server.modules, sceneSetup)).toBeUndefined();
		expect(client.bundle).toContain('client-object-renderer');
		expect(client.bundle).toContain('authored-scene-setup');
		expect(server.bundle).not.toContain('client-object-renderer');
		expect(server.bundle).not.toContain('authored-scene-setup');
		expect(server.bundle).not.toContain('authored-client-metadata');
		expect(server.bundle).toContain('after');

		write(
			root,
			'src/App.tsrx',
			`import { Canvas } from '@fixture/object-boundaries';
import Scene from './Scene.object.tsrx';
export function App() @{ const live = Scene as unknown; <Canvas><Scene /></Canvas> }
`,
		);
		await expect(build('server')).rejects.toThrow(
			/Client-only export "default".*server: "omit-child"/s,
		);
	}, 30_000);

	it('emits parseable webpack HMR wiring when Rspack marks the loader context hot', async () => {
		const outputPath = join(root, 'dist-hmr');
		await compile({
			context: root,
			mode: 'development',
			target: 'web',
			entry: './src/index.js',
			optimization: { minimize: false },
			output: { path: outputPath, filename: 'bundle.js' },
			plugins: [new rspack.HotModuleReplacementPlugin(), new OctaneRspackPlugin()],
		});

		const bundle = readFileSync(join(outputPath, 'bundle.js'), 'utf8');
		expect(bundle).toContain('__octaneComponents');
		expect(bundle).toContain('__webpack_require__.hmrD');
	}, 30_000);

	it('erases profiling from normal production bundles', async () => {
		const normal = await buildRealRuntime(false);
		for (const marker of [
			'__OCTANE_PROFILER__',
			'octane.component',
			'/src/ProfileBundleProbe.tsrx#ProfileBundleProbe',
		]) {
			expect(normal.code).not.toContain(marker);
		}
		await import(`${pathToFileURL(normal.file).href}?normal`);
		expect((globalThis as any)[runGlobal]).toBe(1);
		expect((globalThis as any)[profilerGlobal]).toBeUndefined();
	}, 30_000);

	it('executes the profiled runtime', async () => {
		const profiled = await buildRealRuntime(true);
		expect(profiled.code).toContain('__OCTANE_PROFILER__');
		expect(profiled.code).toContain('octane.component');
		expect(profiled.code).toContain('/src/ProfileBundleProbe.tsrx#ProfileBundleProbe');

		await import(`${pathToFileURL(profiled.file).href}?profile`);
		expect((globalThis as any)[runGlobal]).toBe(1);
		const profiler = (globalThis as any)[profilerGlobal];
		expect(profiler.getEvents()).toEqual([]);
		expect(profiler.exportTrace()).toMatchObject({ displayTimeUnit: 'ms', traceEvents: [] });
	}, 30_000);

	it('deduplicates profiling imports from raw dependencies', async () => {
		const profiled = await buildRealRuntime(true, 'web', true);
		expect(profiled.code).toContain('raw-binding-output');
		expect(profiled.code).toContain('__OCTANE_PROFILER__');
		expect(profiled.code).not.toContain('__octane_nested_profiling_runtime__');
	}, 30_000);

	it('ignores profile mode in server bundles', async () => {
		const server = await buildRealRuntime(true, 'node');
		for (const marker of [
			'__OCTANE_PROFILER__',
			'octane.component',
			'/src/ProfileBundleProbe.tsrx#ProfileBundleProbe',
		]) {
			expect(server.code).not.toContain(marker);
		}
	}, 30_000);

	it('invalidates persistent module caches when profiling toggles', async () => {
		const cacheDirectory = join(root, '.rspack-profile-cache');
		const build = async (profile: boolean, index: number) => {
			const outputPath = join(root, `dist-profile-cache-${index}`);
			await compile({
				name: 'profile-cache-fixture',
				context: root,
				mode: 'production',
				target: 'web',
				entry: './src/index.js',
				cache: {
					type: 'persistent',
					version: 'user-cache-v1',
					storage: { type: 'filesystem', directory: cacheDirectory },
				},
				optimization: { minimize: false },
				output: { path: outputPath, filename: 'bundle.js' },
				plugins: [new OctaneRspackPlugin({ profile })],
			});
			return readFileSync(join(outputPath, 'bundle.js'), 'utf8');
		};

		const normal = await build(false, 1);
		const profiled = await build(true, 2);
		const normalAgain = await build(false, 3);
		expect(normal).not.toContain('/src/App.tsrx#App');
		expect(profiled).toContain('/src/App.tsrx#App');
		expect(normalAgain).not.toContain('/src/App.tsrx#App');
	}, 30_000);

	it.each(['before', 'after'] as const)(
		'rejects a conflicting reserved define applied %s the Octane plugin',
		async (order) => {
			const outputPath = join(root, `dist-profile-define-${order}`);
			const octane = new OctaneRspackPlugin({ profile: true });
			const conflicting = new rspack.DefinePlugin({
				__OCTANE_PROFILE_ENABLED__: JSON.stringify(false),
			});
			await expect(
				compile({
					context: root,
					mode: 'production',
					target: 'web',
					entry: './src/index.js',
					output: { path: outputPath, filename: 'bundle.js' },
					plugins: order === 'before' ? [conflicting, octane] : [octane, conflicting],
				}),
			).rejects.toThrow(/__OCTANE_PROFILE_ENABLED__.*reserved/);
		},
	);
});
