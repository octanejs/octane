import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	canonicalModuleId: vi.fn(),
	cleanModuleId: vi.fn(),
	createOctaneCompiler: vi.fn(),
	transform: vi.fn(),
}));

vi.mock('octane/compiler/bundler', () => ({
	canonicalModuleId: mocks.canonicalModuleId,
	cleanModuleId: mocks.cleanModuleId,
	createOctaneCompiler: mocks.createOctaneCompiler,
}));

import octaneLoader from '../src/loader.js';
import finalizeOctaneLoader, { pitch as pitchOctaneLoader } from '../src/finalize-loader.js';
import parallelOctaneLoader from '../src/parallel-loader.js';

interface LoaderResult {
	error: Error | null;
	content?: string | Buffer;
	map?: unknown;
	metadata?: unknown;
}

function runLoader({
	options = {},
	target = 'web',
	hot = false,
	mode = 'development',
	sourceMap = true,
	resource = '/project/src/App.tsrx?cache=1',
	source = 'export function App() @{ <div /> }',
	inputSourceMap,
	module = { buildInfo: {} as Record<string, unknown>, layer: undefined as string | undefined },
}: {
	options?: Record<string, unknown>;
	target?: unknown;
	hot?: boolean;
	mode?: string;
	sourceMap?: boolean;
	resource?: string;
	source?: string | Buffer;
	inputSourceMap?: unknown;
	module?: { buildInfo: Record<string, unknown>; layer?: string };
} = {}) {
	const dependencies: string[] = [];
	const missingDependencies: string[] = [];
	let result: LoaderResult | undefined;
	const context = {
		rootContext: '/project',
		resource,
		resourcePath: resource.split('?')[0],
		target,
		hot,
		mode,
		sourceMap,
		_module: module,
		cacheable: vi.fn(),
		getOptions: () => options,
		addDependency: (dependency: string) => dependencies.push(dependency),
		addMissingDependency: (dependency: string) => missingDependencies.push(dependency),
		callback: (error: Error | null, content?: string | Buffer, map?: unknown) => {
			result = { error, content, map };
		},
	};
	octaneLoader.call(context, source, inputSourceMap);
	return { context, dependencies, missingDependencies, module, result: result! };
}

function runParallelLoader({
	options = {},
	source = 'export function App() @{ <div /> }',
	inputSourceMap,
	module = { buildInfo: {} as Record<string, unknown>, layer: undefined as string | undefined },
}: {
	options?: Record<string, unknown>;
	source?: string;
	inputSourceMap?: unknown;
	module?: { buildInfo: Record<string, unknown>; layer?: string };
} = {}) {
	const dependencies: string[] = [];
	const missingDependencies: string[] = [];
	let result: LoaderResult | undefined;
	const finalizer = {
		_module: module,
		data: {} as Record<string, unknown>,
		addMissingDependency: (dependency: string) => missingDependencies.push(dependency),
		callback: (
			error: Error | null,
			content?: string | Buffer,
			map?: unknown,
			metadata?: unknown,
		) => {
			result = { error, content, map, ...(metadata === undefined ? {} : { metadata }) };
		},
	};
	pitchOctaneLoader.call(finalizer);

	const workerCallback = (
		error: Error | null,
		content?: string | Buffer,
		map?: unknown,
		metadata?: unknown,
	) => {
		if (error) {
			result = { error, content, map };
			return;
		}
		finalizeOctaneLoader.call(finalizer, content, map, metadata);
	};
	const worker = {
		rootContext: '/project',
		resource: '/project/src/App.tsrx?cache=1',
		resourcePath: '/project/src/App.tsrx',
		target: 'web',
		hot: false,
		mode: 'development',
		sourceMap: true,
		_module: { buildInfo: {} as Record<string, unknown>, layer: undefined as string | undefined },
		loaders: [{ loaderItem: { data: finalizer.data } }, {}],
		loaderIndex: 1,
		cacheable: vi.fn(),
		getOptions: () => options,
		addDependency: (dependency: string) => dependencies.push(dependency),
		callback: workerCallback,
		async: () => workerCallback,
	};
	parallelOctaneLoader.call(worker, source, inputSourceMap);
	return { dependencies, missingDependencies, module, result: result! };
}

describe('octane Rspack loader', () => {
	beforeEach(() => {
		mocks.transform.mockReset();
		mocks.canonicalModuleId.mockReset().mockReturnValue('/src/App.tsrx');
		mocks.cleanModuleId.mockReset().mockImplementation((id: string) => id.replace(/[?#].*$/, ''));
		mocks.createOctaneCompiler.mockReset().mockImplementation(() => ({
			transform: mocks.transform,
		}));
	});

	it('uses webpack HMR, forwards maps, watches manifests, and emits build metadata', () => {
		const map = { version: 3, sources: ['App.tsrx'], mappings: 'AAAA' };
		mocks.transform.mockReturnValue({
			code: 'const rpc = _$__serverRpc(1);',
			map,
			kind: 'compile',
			universalRuntime: { runtime: 'lynx', thread: 'background' },
			dependencies: ['/project/package.json', '/project/src/package.json'],
			missingDependencies: ['/project/src/missing/package.json'],
		});
		const output = runLoader({
			hot: true,
			options: {
				universalRuntime: { runtime: 'lynx', thread: 'background' },
				renderers: {
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
					rules: [{ include: '**/*.object.tsrx', renderer: 'object' }],
				},
			},
		});

		expect(output.context.cacheable).toHaveBeenCalledWith(true);
		expect(mocks.createOctaneCompiler).toHaveBeenCalledWith(
			expect.objectContaining({
				root: '/project',
				renderers: expect.objectContaining({
					registry: expect.objectContaining({
						object: expect.objectContaining({
							module: '/src/object-renderer.js',
							target: 'universal',
						}),
					}),
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
				universalRuntime: { runtime: 'lynx', thread: 'background' },
			}),
		);
		expect(mocks.transform).toHaveBeenCalledWith(
			'export function App() @{ <div /> }',
			'/project/src/App.tsrx?cache=1',
			expect.objectContaining({ environment: 'client', hmr: 'webpack', dev: true }),
		);
		expect(output.dependencies).toEqual(['/project/package.json', '/project/src/package.json']);
		expect(output.missingDependencies).toEqual(['/project/src/missing/package.json']);
		expect(output.result).toEqual({
			error: null,
			content: 'const rpc = _$__serverRpc(1);',
			map,
		});
		expect(output.module.buildInfo.octane).toEqual({
			canonicalId: '/src/App.tsrx',
			transformKind: 'compile',
			serverRpc: true,
			universalRuntime: { runtime: 'lynx', thread: 'background' },
		});
	});

	it('selects compiler configuration from the current Rspack layer', () => {
		mocks.transform.mockReturnValue(null);
		const options = {
			renderers: {
				registry: { native: '/src/background-renderer.js' },
				default: 'native',
			},
			universalRuntime: { runtime: 'native', thread: 'background' },
			layerSpecializations: {
				'octane:main-thread': {
					runtime: '@fixture/main-runtime',
					renderers: {
						registry: { native: '/src/main-renderer.js' },
						default: 'native',
					},
					universalRuntime: { runtime: 'native', thread: 'main-thread' },
				},
			},
		};

		runLoader({
			options,
			module: { buildInfo: {}, layer: 'octane:main-thread' },
		});
		expect(mocks.createOctaneCompiler).toHaveBeenLastCalledWith(
			expect.objectContaining({
				renderers: expect.objectContaining({
					registry: {
						dom: expect.any(Object),
						native: expect.objectContaining({ module: '/src/main-renderer.js' }),
					},
					default: 'native',
				}),
				universalRuntime: { runtime: 'native', thread: 'main-thread' },
			}),
		);

		runLoader({
			options,
			module: { buildInfo: {}, layer: 'other' },
		});
		expect(mocks.createOctaneCompiler).toHaveBeenLastCalledWith(
			expect.objectContaining({
				renderers: expect.objectContaining({
					registry: expect.objectContaining({
						native: expect.objectContaining({ module: '/src/background-renderer.js' }),
					}),
					default: 'native',
				}),
				universalRuntime: { runtime: 'native', thread: 'background' },
			}),
		);
	});

	it('composes a prior loader map with the Octane compiler map', () => {
		mocks.transform.mockReturnValue({
			code: 'export const compiled = true;',
			map: { version: 3, sources: ['intermediate.tsx'], names: [], mappings: 'AAAA' },
			kind: 'compile',
			dependencies: [],
			missingDependencies: [],
		});
		const output = runLoader({
			inputSourceMap: {
				version: 3,
				sources: ['original.mdx'],
				names: [],
				mappings: 'AAAA',
			},
		});

		expect(output.result.map).toMatchObject({ sources: ['original.mdx'] });
	});

	it('infers server mode and suppresses HMR and client dev metadata', () => {
		mocks.transform.mockReturnValue({
			code: 'export const html = "ok";',
			map: null,
			kind: 'compile',
			dependencies: [],
			missingDependencies: [],
		});
		runLoader({ target: ['es2022', 'node'], hot: true, options: { hmr: true, dev: true } });
		expect(mocks.transform).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(String),
			expect.objectContaining({ environment: 'server', hmr: false, dev: false }),
		);
	});

	it('does not emit HMR when the loader context is not hot', () => {
		mocks.transform.mockReturnValue(null);
		runLoader({ options: { hmr: true }, hot: false });
		expect(mocks.transform).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(String),
			expect.objectContaining({ environment: 'client', hmr: false, dev: true }),
		);
	});

	it.each([true, false])('forwards strong: %s to the neutral compiler', (strong) => {
		mocks.transform.mockReturnValue(null);
		runLoader({ options: { strong } });

		expect(mocks.createOctaneCompiler).toHaveBeenCalledWith(
			expect.objectContaining({ root: '/project', strong }),
		);
	});

	it('resolves a loader-only relative root from Rspack rootContext', () => {
		mocks.transform.mockReturnValue(null);
		runLoader({ options: { root: 'apps/site' } });
		expect(mocks.createOctaneCompiler).toHaveBeenCalledWith(
			expect.objectContaining({ root: '/project/apps/site' }),
		);
	});

	it('registers pass-through eligibility metadata without attaching build info', () => {
		mocks.transform.mockReturnValue({
			code: 'const untouched = true;',
			map: null,
			kind: 'none',
			dependencies: ['/project/src/package.json'],
			missingDependencies: ['/project/package.json'],
		});
		const inputMap = { version: 3, mappings: '' };
		const module = {
			buildInfo: {
				octane: { canonicalId: '/stale', transformKind: 'compile', serverRpc: false },
			},
		};
		const output = runLoader({
			source: 'const untouched = true;',
			inputSourceMap: inputMap,
			module,
		});
		expect(output.result.content).toBe('const untouched = true;');
		expect(output.result.map).toBe(inputMap);
		expect(output.dependencies).toEqual(['/project/src/package.json']);
		expect(output.missingDependencies).toEqual(['/project/package.json']);
		expect(module.buildInfo).not.toHaveProperty('octane');
	});

	it('passes unrelated sources and maps through and clears stale metadata', () => {
		mocks.transform.mockReturnValue(null);
		const inputMap = { version: 3, mappings: '' };
		const module = {
			buildInfo: {
				octane: { canonicalId: '/stale', transformKind: 'compile', serverRpc: false },
			},
		};
		const output = runLoader({ inputSourceMap: inputMap, module });
		expect(output.result.content).toBe('export function App() @{ <div /> }');
		expect(output.result.map).toBe(inputMap);
		expect(module.buildInfo).not.toHaveProperty('octane');
	});

	it('reports compiler errors through the loader callback', () => {
		mocks.transform.mockImplementation(() => {
			throw new Error('bad TSRX');
		});
		const output = runLoader();
		expect(output.result.error).toEqual(new Error('bad TSRX'));
		expect(output.result.content).toBeUndefined();
	});

	it('preserves layers, source maps, file watches, and public module metadata in parallel', () => {
		const map = { version: 3, sources: ['App.tsrx'], mappings: 'AAAA' };
		const clientReference = {
			id: 'octane-client-reference-v1:object:/src/App.tsrx',
			moduleId: '/src/App.tsrx',
			renderer: 'object',
		};
		mocks.transform.mockReturnValue({
			code: 'export const rendered = true;',
			map,
			kind: 'compile',
			clientReference,
			universalRuntime: { runtime: 'object', thread: 'main-thread' },
			dependencies: ['/project/package.json', '/project/package.json'],
			missingDependencies: ['/project/src/package.json', '/project/src/package.json'],
		});
		const module = { buildInfo: {}, layer: 'octane:main-thread' };
		const output = runParallelLoader({
			module,
			options: {
				universalRuntime: { runtime: 'object', thread: 'background' },
				layerSpecializations: {
					'octane:main-thread': {
						universalRuntime: { runtime: 'object', thread: 'main-thread' },
					},
				},
			},
		});

		expect(mocks.createOctaneCompiler).toHaveBeenCalledWith(
			expect.objectContaining({ universalRuntime: { runtime: 'object', thread: 'main-thread' } }),
		);
		expect(output.result).toEqual({ error: null, content: 'export const rendered = true;', map });
		expect(output.dependencies).toEqual(['/project/package.json']);
		expect(output.missingDependencies).toEqual(['/project/src/package.json']);
		expect(output.module.layer).toBe('octane:main-thread');
		expect(output.module.buildInfo.octane).toEqual({
			canonicalId: '/src/App.tsrx',
			transformKind: 'compile',
			serverRpc: false,
			universalRuntime: { runtime: 'object', thread: 'main-thread' },
			clientReference,
		});
	});

	it('clears obsolete parallel-build metadata when a module becomes pass-through', () => {
		mocks.transform.mockReturnValue({
			code: 'export const untouched = true;',
			map: null,
			kind: 'none',
			dependencies: ['/project/package.json'],
			missingDependencies: ['/project/src/package.json'],
		});
		const inputSourceMap = { version: 3, sources: ['authored.ts'], mappings: 'AAAA' };
		const module = {
			buildInfo: {
				octane: { canonicalId: '/stale', transformKind: 'compile', serverRpc: false },
			},
		};
		const output = runParallelLoader({
			module,
			source: 'export const untouched = true;',
			inputSourceMap,
		});

		expect(output.result).toEqual({
			error: null,
			content: 'export const untouched = true;',
			map: inputSourceMap,
		});
		expect(output.dependencies).toEqual(['/project/package.json']);
		expect(output.missingDependencies).toEqual(['/project/src/package.json']);
		expect(output.module.buildInfo).not.toHaveProperty('octane');
	});

	it('preserves unrelated loader metadata while restoring worker compilation state', () => {
		const module = { buildInfo: {} as Record<string, unknown> };
		const callback = vi.fn();
		const addMissingDependency = vi.fn();
		const sourceMap = { version: 3, sources: ['App.tsrx'], mappings: 'AAAA' };
		const info = { canonicalId: '/src/App.tsrx', transformKind: 'compile', serverRpc: false };

		finalizeOctaneLoader.call(
			{ _module: module, addMissingDependency, callback },
			'export const rendered = true;',
			sourceMap,
			{
				upstream: { generated: true },
				__octaneParallelLoader: {
					buildInfo: info,
					missingDependencies: ['/project/src/package.json'],
				},
			},
		);

		expect(module.buildInfo.octane).toEqual(info);
		expect(addMissingDependency).toHaveBeenCalledWith('/project/src/package.json');
		expect(callback).toHaveBeenCalledWith(null, 'export const rendered = true;', sourceMap, {
			upstream: { generated: true },
		});
	});

	it('reports parallel compilation errors without attaching incomplete module metadata', () => {
		mocks.transform.mockImplementation(() => {
			throw new Error('bad TSRX');
		});
		const output = runParallelLoader();

		expect(output.result.error).toEqual(new Error('bad TSRX'));
		expect(output.result.content).toBeUndefined();
		expect(output.module.buildInfo).not.toHaveProperty('octane');
	});
});
