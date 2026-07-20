import { describe, expect, it } from 'vitest';
import { getOctaneRspackBuildInfo, inferRspackEnvironment } from '../src/index.js';
import { normalizeLoaderOptions, normalizePluginOptions } from '../src/shared.js';

describe('inferRspackEnvironment', () => {
	it.each([
		['web', 'client'],
		['webworker', 'client'],
		['electron-renderer', 'client'],
		['node', 'server'],
		['node22', 'server'],
		['async-node', 'server'],
		['electron-main', 'server'],
		[['es2022', 'node'], 'server'],
		[undefined, 'client'],
	] as const)('maps %j to %s', (target, expected) => {
		expect(inferRspackEnvironment(target)).toBe(expected);
	});
});

describe('declarative options', () => {
	it('copies and freezes loader option arrays', () => {
		const exclude = ['generated'];
		const options = normalizeLoaderOptions({ environment: 'client', exclude });
		exclude.push('later');
		expect(options).toEqual({ environment: 'client', exclude: ['generated'] });
		expect(Object.isFrozen(options)).toBe(true);
		expect(Object.isFrozen(options.exclude)).toBe(true);
	});

	it('normalizes and deeply freezes declarative renderer options', () => {
		const renderers = {
			registry: { object: '/src/object-renderer.js' },
			boundaries: {
				'/src/object-boundaries.js': {
					Canvas: {
						ownerRenderer: 'dom',
						childRenderer: 'object',
						prop: 'children',
					},
				},
			},
			rules: [{ include: ['src/**/*.object.tsrx'], renderer: 'object' }],
		};
		const options = normalizePluginOptions({ renderers });
		renderers.registry.object = '/src/later.js';
		renderers.boundaries['/src/object-boundaries.js'].Canvas.prop = 'content';
		renderers.rules[0].include.push('src/**/*.later.tsrx');
		const normalized = options.renderers!;

		expect(normalized).toMatchObject({
			registry: { object: { module: '/src/object-renderer.js', target: 'universal' } },
			boundaries: {
				'/src/object-boundaries.js': {
					Canvas: {
						ownerRenderer: 'dom',
						childRenderer: 'object',
						prop: 'children',
					},
				},
			},
			rules: [{ include: ['src/**/*.object.tsrx'], renderer: 'object' }],
		});
		expect(Object.isFrozen(normalized)).toBe(true);
		expect(Object.isFrozen(normalized.registry)).toBe(true);
		expect(Object.isFrozen(normalized.registry.object)).toBe(true);
		expect(Object.isFrozen(normalized.boundaries)).toBe(true);
		expect(Object.isFrozen(normalized.boundaries['/src/object-boundaries.js'])).toBe(true);
		expect(Object.isFrozen(normalized.boundaries['/src/object-boundaries.js'].Canvas)).toBe(true);
		expect(Object.isFrozen(normalized.rules)).toBe(true);
		expect(Object.isFrozen(normalized.rules[0].include)).toBe(true);
	});

	it('normalizes and deeply freezes state-model package policy', () => {
		const stateModel = {
			default: 'causal',
			packages: { zed: 'permissive', '@scope/alpha': 'causal' },
		};
		const options = normalizePluginOptions({ stateModel });
		stateModel.default = 'permissive';
		stateModel.packages.zed = 'causal';

		expect(options.stateModel).toMatchObject({
			default: 'causal',
			packages: { '@scope/alpha': 'causal', zed: 'permissive' },
		});
		expect(Object.isFrozen(options.stateModel)).toBe(true);
		expect(Object.isFrozen(options.stateModel!.packages)).toBe(true);
	});

	it('accepts the plugin-only transpile switch', () => {
		expect(normalizePluginOptions({ transpile: false })).toEqual({ transpile: false });
		expect(() => normalizeLoaderOptions({ transpile: false })).toThrow(
			/unknown option `transpile`/,
		);
	});

	it('normalizes compile-runtime metadata and a plugin-only runtime request', () => {
		const universalRuntime = { runtime: 'lynx', thread: 'background' as const };
		const options = normalizePluginOptions({
			runtime: '@octanejs/lynx/renderer',
			universalRuntime,
		});
		universalRuntime.runtime = 'later';

		expect(options).toEqual({
			runtime: '@octanejs/lynx/renderer',
			universalRuntime: { runtime: 'lynx', thread: 'background' },
		});
		expect(Object.isFrozen(options.universalRuntime)).toBe(true);
		expect(() => normalizeLoaderOptions({ runtime: 'other' })).toThrow(/unknown option `runtime`/);
	});

	it.each([
		[{ environment: 'worker' }, /environment/],
		[{ hmr: 'webpack' }, /hmr/],
		[{ exclude: 'vendor' }, /exclude/],
		[{ renderers: { default: 'missing' } }, /default references unknown renderer/],
		[{ stateModel: { default: 'strict' } }, /must be "causal" or "permissive"/],
		[{ universalRuntime: { runtime: 'lynx', thread: 'worker' } }, /thread/],
		[{ universalRuntime: { runtime: 'Lynx', thread: 'background' } }, /runtime/],
		[{ runtime: '' }, /runtime/],
		[{ transform: () => {} }, /unknown option/],
	] as const)('rejects invalid options %#', (value, message) => {
		expect(() => normalizePluginOptions(value)).toThrow(message);
	});
});

describe('getOctaneRspackBuildInfo', () => {
	it('returns only a complete serializable record', () => {
		const value = {
			canonicalId: '/src/App.tsrx',
			transformKind: 'compile' as const,
			serverRpc: true,
		};
		expect(getOctaneRspackBuildInfo({ buildInfo: { octane: value } })).toBe(value);
		expect(
			getOctaneRspackBuildInfo({
				buildInfo: {
					octane: {
						...value,
						universalRuntime: { runtime: 'lynx', thread: 'background' },
					},
				},
			}),
		).toEqual({
			...value,
			universalRuntime: { runtime: 'lynx', thread: 'background' },
		});
		expect(
			getOctaneRspackBuildInfo({
				buildInfo: {
					octane: {
						...value,
						clientReference: {
							id: 'octane-client-reference-v1:object:/src/App.tsrx',
							moduleId: '/src/App.tsrx',
							renderer: 'object',
						},
					},
				},
			}),
		).toEqual({
			...value,
			clientReference: {
				id: 'octane-client-reference-v1:object:/src/App.tsrx',
				moduleId: '/src/App.tsrx',
				renderer: 'object',
			},
		});
		expect(
			getOctaneRspackBuildInfo({
				buildInfo: {
					octane: {
						...value,
						clientReference: { id: 'partial' },
					},
				},
			}),
		).toBeNull();
		expect(
			getOctaneRspackBuildInfo({ buildInfo: { octane: { ...value, serverRpc: 'yes' } } }),
		).toBeNull();
		expect(
			getOctaneRspackBuildInfo({
				buildInfo: {
					octane: {
						...value,
						universalRuntime: { runtime: 'lynx', thread: 'worker' },
					},
				},
			}),
		).toBeNull();
		expect(getOctaneRspackBuildInfo(null)).toBeNull();
	});
});
