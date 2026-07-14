import { beforeEach, describe, expect, it, vi } from 'vitest';

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
	const profilingDefinitions: Record<string, string>[] = [];
	class DefinePlugin {
		constructor(definitions: Record<string, string>) {
			profilingDefinitions.push(definitions);
		}
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
		profilingDefinitions,
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

		expect(mocks.createOctaneCompiler).toHaveBeenCalledWith({ root: '/project', profile: false });
		expect(compiler.profilingDefinitions).toEqual([{ __OCTANE_PROFILE_ENABLED__: 'false' }]);
		expect(mocks.resolveRuntimeRequest).toHaveBeenCalledWith('octane', 'server');
		expect(compiler.options.resolve.extensions).toEqual(['.tsrx', '.tsx', '.ts', '.js']);
		const aliases = compiler.options.resolve.alias as Record<string, string>;
		expect(aliases['@']).toBe('/project/src');
		expect(aliases['octane$']).toMatch(
			/(?:octane\/server|packages\/octane\/src\/server\/index\.ts)$/,
		);
		expect(aliases['octane/profiling$']).toMatch(
			/(?:octane\/profiling|packages\/octane\/src\/profiling\.ts)$/,
		);
		expect(compiler.options.module.rules).toHaveLength(2);
		expect(compiler.options.module.rules[0]).toMatchObject({
			type: 'javascript/auto',
			enforce: 'pre',
			use: [{ options: { root: '/project', environment: 'server', profile: false } }],
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
		const compiler = createCompiler('node');
		const plugin = octaneRspack({
			environment: 'client',
			hmr: false,
			dev: true,
			profile: true,
			parallelUse: false,
			exclude: ['generated'],
			transpile: false,
		});
		plugin.apply(compiler as any);

		expect(mocks.resolveRuntimeRequest).toHaveBeenCalledWith('octane', 'client');
		expect(mocks.createOctaneCompiler).toHaveBeenCalledWith({
			root: '/project',
			profile: true,
			parallelUse: false,
			exclude: ['generated'],
		});
		expect(compiler.profilingDefinitions).toEqual([{ __OCTANE_PROFILE_ENABLED__: 'true' }]);
		const aliases = compiler.options.resolve.alias as Record<string, string>;
		expect(aliases['octane$']).toMatch(/(?:^octane$|packages\/octane\/src\/index\.ts$)/);
		expect(aliases['octane/profiling$']).toMatch(
			/(?:octane\/profiling|packages\/octane\/src\/profiling\.ts)$/,
		);
		expect(compiler.options.module.rules).toHaveLength(1);
		expect(compiler.options.module.rules[0].use[0].options).toEqual({
			root: '/project',
			environment: 'client',
			hmr: false,
			dev: true,
			profile: true,
			parallelUse: false,
			exclude: ['generated'],
		});
	});

	it('resolves a relative root from the Rspack context', () => {
		const compiler = createCompiler('web');
		new OctaneRspackPlugin({ root: 'apps/site' }).apply(compiler as any);
		expect(mocks.createOctaneCompiler).toHaveBeenCalledWith({
			root: '/project/apps/site',
			profile: false,
		});
	});

	it('forces profiling off for an explicit server compilation', () => {
		const compiler = createCompiler('web');
		new OctaneRspackPlugin({ environment: 'server', profile: true }).apply(compiler as any);

		expect(compiler.profilingDefinitions).toEqual([{ __OCTANE_PROFILE_ENABLED__: 'false' }]);
		expect(compiler.options.module.rules[0].use[0].options).toMatchObject({
			environment: 'server',
			profile: false,
		});
	});

	it('rejects a conflicting user definition of the reserved profiling constant', () => {
		const compiler = createCompiler('web');
		(compiler.options as any).plugins = [
			{
				name: 'DefinePlugin',
				_args: [{ __OCTANE_PROFILE_ENABLED__: 'false' }],
			},
		] as any;

		expect(() => new OctaneRspackPlugin({ profile: true }).apply(compiler as any)).toThrow(
			/__OCTANE_PROFILE_ENABLED__.*reserved/,
		);
	});

	it('preserves and salts a persistent-cache version with effective compiler inputs', () => {
		const profiled = createCompiler('web');
		(profiled.options as any).mode = 'production';
		(profiled.options as any).cache = { type: 'persistent', version: 'user-cache-v1' };
		new OctaneRspackPlugin({ profile: true, parallelUse: false }).apply(profiled as any);

		const normal = createCompiler('web');
		(normal.options as any).mode = 'production';
		(normal.options as any).cache = { type: 'persistent', version: 'user-cache-v1' };
		new OctaneRspackPlugin({ profile: false, parallelUse: false }).apply(normal as any);

		expect((profiled.options as any).cache.version).toMatch(
			/^user-cache-v1\|octane-rspack@[^:]+:[a-f0-9]{16}$/,
		);
		expect((normal.options as any).cache.version).toMatch(
			/^user-cache-v1\|octane-rspack@[^:]+:[a-f0-9]{16}$/,
		);
		expect((profiled.options as any).cache.version).not.toBe((normal.options as any).cache.version);
	});
});
