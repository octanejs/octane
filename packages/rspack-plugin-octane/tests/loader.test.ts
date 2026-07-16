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

interface LoaderResult {
	error: Error | null;
	content?: string | Buffer;
	map?: unknown;
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
	module = { buildInfo: {} as Record<string, unknown> },
}: {
	options?: Record<string, unknown>;
	target?: unknown;
	hot?: boolean;
	mode?: string;
	sourceMap?: boolean;
	resource?: string;
	source?: string | Buffer;
	inputSourceMap?: unknown;
	module?: { buildInfo: Record<string, unknown> };
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
			dependencies: ['/project/package.json', '/project/src/package.json'],
			missingDependencies: ['/project/src/missing/package.json'],
		});
		const output = runLoader({
			hot: true,
			options: {
				autoMemo: false,
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
				autoMemo: false,
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
			}),
		);
		expect(mocks.transform).toHaveBeenCalledWith(
			'export function App() @{ <div /> }',
			'/project/src/App.tsrx?cache=1',
			expect.objectContaining({
				environment: 'client',
				hmr: 'webpack',
				dev: true,
				autoMemo: false,
			}),
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
		});
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
});
