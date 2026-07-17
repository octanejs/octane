import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({
	createOctaneCompiler: vi.fn(),
	discoverSourceDependencies: vi.fn(),
	invalidate: vi.fn(),
	resolveRuntimeRequest: vi.fn(),
}));

vi.mock('octane/compiler/bundler', () => ({
	createOctaneCompiler: mocks.createOctaneCompiler,
}));

import { OctaneRspackPlugin, octaneRspack } from '../src/index.js';

function hook() {
	let callback: ((...args: any[]) => void) | undefined;
	return {
		tap: vi.fn((_name: string, value: (...args: any[]) => void) => {
			callback = value;
		}),
		call: (...args: any[]) => callback?.(...args),
	};
}

function createCompiler(target: unknown = 'node') {
	class DefinePlugin {
		constructor(_definitions: Record<string, string>) {}
		apply() {}
	}
	return {
		options: {
			context: '/project',
			target,
			resolve: { extensions: ['.js'], alias: { '@': '/project/src' } },
			module: { rules: [] as any[] },
		},
		hooks: {
			invalid: hook(),
			watchRun: hook(),
			thisCompilation: hook(),
		},
		webpack: { DefinePlugin },
	};
}

describe('OctaneRspackPlugin', () => {
	beforeEach(() => {
		mocks.discoverSourceDependencies.mockReset().mockReturnValue({
			packages: ['@octanejs/raw-binding'],
			dependencies: ['/project/package.json', '/project/node_modules/raw/package.json'],
			missingDependencies: ['/project/node_modules/optional/package.json'],
		});
		mocks.invalidate.mockReset();
		mocks.resolveRuntimeRequest
			.mockReset()
			.mockImplementation((_request, environment) =>
				environment === 'server' ? 'octane/server' : 'octane',
			);
		mocks.createOctaneCompiler.mockReset().mockReturnValue({
			discoverSourceDependencies: mocks.discoverSourceDependencies,
			invalidate: mocks.invalidate,
			resolveRuntimeRequest: mocks.resolveRuntimeRequest,
		});
	});

	it('configures server compilation, runtime resolution, rules, and discovery watching', () => {
		const compiler = createCompiler();
		const plugin = new OctaneRspackPlugin();
		plugin.apply(compiler as any);

		expect(mocks.createOctaneCompiler).toHaveBeenCalledWith(
			expect.objectContaining({ root: '/project' }),
		);
		expect(mocks.resolveRuntimeRequest).toHaveBeenCalledWith('octane', 'server');
		expect(compiler.options.resolve.extensions).toEqual(['.tsrx', '.tsx', '.ts', '.js']);
		const aliases = compiler.options.resolve.alias as Record<string, string>;
		expect(aliases['@']).toBe('/project/src');
		expect(aliases['octane$']).toMatch(
			/(?:octane\/server|packages\/octane\/src\/server\/index\.ts)$/,
		);
		expect(compiler.options.module.rules).toHaveLength(2);
		expect(compiler.options.module.rules[0]).toMatchObject({
			type: 'javascript/auto',
			enforce: 'pre',
			use: [{ options: expect.objectContaining({ root: '/project', environment: 'server' }) }],
		});
		expect(compiler.options.module.rules[1]).toEqual({
			test: expect.any(RegExp),
			type: 'javascript/auto',
			use: [{ loader: 'builtin:swc-loader', options: { detectSyntax: 'auto' } }],
		});

		const compilation = { fileDependencies: new Set(), missingDependencies: new Set() };
		compiler.hooks.thisCompilation.call(compilation);
		expect(compilation.fileDependencies).toEqual(
			new Set(['/project/package.json', '/project/node_modules/raw/package.json']),
		);
		expect(compilation.missingDependencies).toEqual(
			new Set(['/project/node_modules/optional/package.json']),
		);
		expect(plugin.sourceDependencies).toEqual(['@octanejs/raw-binding']);

		compiler.hooks.invalid.call('/project/package.json');
		expect(mocks.invalidate).toHaveBeenCalledWith('/project/package.json');
		compiler.hooks.thisCompilation.call({
			fileDependencies: new Set(),
			missingDependencies: new Set(),
		});
		expect(mocks.discoverSourceDependencies).toHaveBeenCalledTimes(2);
	});

	it('honors explicit client mode and serializable loader options', () => {
		const existingHostPath = process.execPath;
		const compiler = createCompiler('node');
		const plugin = octaneRspack({
			environment: 'client',
			hmr: false,
			dev: true,
			exclude: ['generated'],
			renderers: {
				registry: {
					object: '/src/object-renderer.js',
					'host-path-lookalike': existingHostPath,
				},
				boundaries: {
					'/src/object-boundaries.js': {
						Canvas: {
							ownerRenderer: 'dom',
							childRenderer: 'object',
							prop: 'children',
						},
					},
				},
				rules: [{ include: '**/*.object.tsrx', renderer: 'object' }],
			},
			transpile: false,
		});
		plugin.apply(compiler as any);

		expect(mocks.resolveRuntimeRequest).toHaveBeenCalledWith('octane', 'client');
		const aliases = compiler.options.resolve.alias as Record<string, string>;
		expect(aliases['octane$']).toMatch(/(?:^octane$|packages\/octane\/src\/index\.ts$)/);
		expect(aliases['/src/object-renderer.js$']).toBe('/project/src/object-renderer.js');
		expect(aliases[`${existingHostPath}$`]).toBe(
			resolve('/project', existingHostPath.replace(/^[/\\]+/, '')),
		);
		expect(compiler.options.module.rules).toHaveLength(1);
		const loaderOptions = compiler.options.module.rules[0].use[0].options;
		expect(loaderOptions).toMatchObject({
			root: '/project',
			environment: 'client',
			hmr: false,
			dev: true,
			exclude: ['generated'],
			renderers: expect.objectContaining({
				default: 'dom',
				signature: expect.stringMatching(/^octane-renderers-v3:/),
				boundaries: {
					'/src/object-boundaries.js': {
						Canvas: {
							ownerRenderer: 'dom',
							childRenderer: 'object',
							prop: 'children',
						},
					},
				},
			}),
		});
		expect(mocks.createOctaneCompiler).toHaveBeenCalledWith(
			expect.objectContaining({
				renderers: expect.objectContaining({
					registry: expect.objectContaining({
						object: expect.objectContaining({
							module: '/src/object-renderer.js',
							target: 'universal',
						}),
					}),
				}),
			}),
		);
	});

	it('salts persistent caches with the normalized renderer configuration', () => {
		const createCachedCompiler = () => {
			const compiler = createCompiler('web');
			(compiler.options as any).cache = { type: 'persistent', version: 'user-cache' };
			return compiler;
		};
		const dom = createCachedCompiler();
		const object = createCachedCompiler();
		const boundedObject = createCachedCompiler();

		new OctaneRspackPlugin().apply(dom as any);
		new OctaneRspackPlugin({
			renderers: {
				registry: { object: '/src/object-renderer.js' },
				default: 'object',
			},
		}).apply(object as any);
		new OctaneRspackPlugin({
			renderers: {
				registry: { object: '/src/object-renderer.js' },
				default: 'object',
				boundaries: {
					'/src/object-boundaries.js': {
						Canvas: {
							ownerRenderer: 'dom',
							childRenderer: 'object',
							prop: 'children',
						},
					},
				},
			},
		}).apply(boundedObject as any);

		expect((dom.options as any).cache.version).toMatch(/^user-cache\|octane-rspack@/);
		expect((object.options as any).cache.version).toMatch(/^user-cache\|octane-rspack@/);
		expect((boundedObject.options as any).cache.version).toMatch(/^user-cache\|octane-rspack@/);
		expect((object.options as any).cache.version).not.toBe((dom.options as any).cache.version);
		expect((boundedObject.options as any).cache.version).not.toBe(
			(object.options as any).cache.version,
		);
	});

	it('resolves a relative root from the Rspack context', () => {
		const compiler = createCompiler('web');
		new OctaneRspackPlugin({ root: 'apps/site' }).apply(compiler as any);
		expect(mocks.createOctaneCompiler).toHaveBeenCalledWith(
			expect.objectContaining({ root: '/project/apps/site' }),
		);
	});

	it('rejects invalid options at the public constructor', () => {
		expect(() => new OctaneRspackPlugin({ profile: 'yes' } as any)).toThrow(/profile/);
		expect(() => new OctaneRspackPlugin({ parallelUse: false } as any)).toThrow(
			/unknown option `parallelUse`/,
		);
	});
});
