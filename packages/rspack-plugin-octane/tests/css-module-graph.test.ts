import { describe, expect, it, vi } from 'vitest';
import { installCssModuleConstants } from '../src/css-module-constants.js';
import {
	CSS_MODULE_BUILD_INFO_KEY,
	CSS_MODULE_CONTEXT_KEY,
	cssModuleSourceHash,
} from '../src/css-module-data.js';

type Tap = { stage: number; run: (...args: any[]) => any };

function hook() {
	const taps: Tap[] = [];
	const add = (options: string | { stage?: number }, run: Tap['run']) => {
		taps.push({ stage: typeof options === 'string' ? 0 : (options.stage ?? 0), run });
	};
	const ordered = () => [...taps].sort((left, right) => left.stage - right.stage);
	return {
		tap: add,
		tapPromise: add,
		call(...args: any[]) {
			for (const tap of ordered()) tap.run(...args);
		},
		async promise(...args: any[]) {
			for (const tap of ordered()) await tap.run(...args);
		},
	};
}

type TestModule = {
	id: string;
	type: string;
	resource: string;
	layer?: string;
	source: string;
	buildInfo: Record<string, any>;
	modules?: TestModule[];
	rootModule?: TestModule;
	identifier(): string;
	originalSource(): { source(): string };
};

function module(
	id: string,
	source: string,
	options: Partial<Pick<TestModule, 'type' | 'resource' | 'layer' | 'buildInfo'>> = {},
): TestModule {
	return {
		id,
		type: 'javascript/auto',
		resource: '/project/styles.module.css',
		source,
		buildInfo: {},
		...options,
		identifier() {
			return this.id;
		},
		originalSource() {
			return { source: () => this.source };
		},
	};
}

function importer(id: string, requests = ['./styles.module.css']) {
	return module(id, 'export {};', {
		resource: `/project/${id}.tsrx`,
		buildInfo: {
			[CSS_MODULE_BUILD_INFO_KEY]: {
				sourceHash: cssModuleSourceHash(`authored:${id}`),
				requests,
				consumed: [],
			},
		},
	});
}

function edge(
	request: string,
	target: TestModule,
	options: { category?: string; attributes?: Record<string, string>; resolved?: TestModule } = {},
) {
	return {
		dependency: {
			request,
			category: options.category ?? 'esm',
			attributes: options.attributes,
		},
		module: target,
		resolvedModule: options.resolved ?? target,
	};
}

type TestEdge = ReturnType<typeof edge>;
type ContextData = {
	proof: null | { imports: { request: string }[] };
};

// Real production builds cover rendered classes and stylesheet ownership. This
// harness supplies adversarial public Rspack graph states that cannot be timed
// reliably in a build, while assertions stay at the provider/diagnostic boundary.
function harness({
	option = true as boolean | ((module: any) => any),
	environment = 'client' as 'client' | 'server',
	mode = 'production',
	watch = false,
} = {}) {
	const compiler = {
		options: { mode, watch },
		watchMode: watch,
		hooks: { thisCompilation: hook(), finishMake: hook() },
		webpack: {
			NormalModule: { getCompilationHooks: (compilation: any) => compilation.loaderHooks },
			Compilation: { PROCESS_ASSETS_STAGE_REPORT: 5000 },
		},
	};
	installCssModuleConstants(compiler as any, { option, environment });
	const createCompilation = (
		modules: TestModule[],
		edges: Map<string, TestEdge[]>,
		options: {
			consume?: (module: TestModule, proof: NonNullable<ContextData['proof']>) => string[];
			afterRebuild?: (module: TestModule, compilation: any) => void;
		} = {},
	) => {
		const compilation: any = {
			modules: new Set(modules),
			loaderHooks: { loader: hook() },
			hooks: { seal: hook(), processAssets: hook() },
			moduleGraph: {
				getOutgoingConnections: (module: TestModule) => edges.get(module.id) ?? [],
			},
		};
		const contextFor = (module: TestModule) => {
			const context: Record<string, any> = {};
			compilation.loaderHooks.loader.call(context, module);
			return context[CSS_MODULE_CONTEXT_KEY] as ContextData | undefined;
		};
		compilation.rebuildModule = (
			requested: TestModule,
			done: (error: Error | null, returned?: TestModule) => void,
		) => {
			const id = requested.id;
			queueMicrotask(() => {
				try {
					const current = [...compilation.modules].find(
						(module: TestModule) => module.id === id,
					) as TestModule;
					// Worker transport must accept the complete proof without a
					// function, Source, or native Module object hidden inside it.
					const data = structuredClone(contextFor(current)!);
					const proof = data.proof!;
					current.buildInfo[CSS_MODULE_BUILD_INFO_KEY] = {
						...current.buildInfo[CSS_MODULE_BUILD_INFO_KEY],
						consumed:
							options.consume?.(current, proof) ?? proof.imports.map((entry) => entry.request),
					};
					options.afterRebuild?.(current, compilation);
					// The real Rspack batch can return these out of request order.
					// Consumers must reacquire the requested ID instead.
					done(null, modules.at(-1));
				} catch (error) {
					done(error as Error);
				}
			});
		};
		compiler.hooks.thisCompilation.call(compilation);
		return {
			compilation,
			finish: () => compiler.hooks.finishMake.promise(compilation),
			seal: () => compilation.hooks.seal.call(),
			emit: () => compilation.hooks.processAssets.call({}),
		};
	};
	return { compiler, createCompilation };
}

const EXPORTS = `var root = 'mapped_root'; var label = 'mapped_label'; export { root, label };`;
const CHANGED = /@octanejs\/rspack-plugin: CSS-module proof changed/;

describe('Rspack CSS-module graph proofs', () => {
	it.each([
		{ invalidKind: 'attributes', invalidFirst: true },
		{ invalidKind: 'attributes', invalidFirst: false },
		{ invalidKind: 'unidentifiable', invalidFirst: true },
		{ invalidKind: 'unidentifiable', invalidFirst: false },
	] as const)(
		'declines $invalidKind targets without poisoning safe peers when invalidFirst=$invalidFirst',
		async ({ invalidKind, invalidFirst }) => {
			const invalidRequest = './invalid.module.css';
			const safeRequest = './safe.module.css';
			const app = importer('request-local-invalidity', [invalidRequest, safeRequest]);
			const invalid = module('invalid', EXPORTS, {
				resource: '/project/invalid.module.css',
			});
			if (invalidKind === 'unidentifiable') invalid.identifier = undefined as any;
			const otherwiseValid = module('otherwise-valid', EXPORTS, {
				resource: '/project/invalid.module.css',
			});
			const safe = module('safe', EXPORTS, { resource: '/project/safe.module.css' });
			const invalidEdge = edge(
				invalidRequest,
				invalid,
				invalidKind === 'attributes' ? { attributes: { type: 'css' } } : {},
			);
			const validEdge = edge(invalidRequest, otherwiseValid);
			const connections = [
				...(invalidFirst ? [invalidEdge, validEdge] : [validEdge, invalidEdge]),
				edge(safeRequest, safe),
			];
			const consumed = vi.fn(() => [safeRequest]);
			const provider = vi.fn((_input: { id: string }) => undefined);
			const graph = harness({ option: provider }).createCompilation(
				[app, invalid, otherwiseValid, safe],
				new Map([[app.id, connections]]),
				{ consume: consumed },
			);

			await expect(graph.finish()).resolves.toBeUndefined();
			expect(consumed).toHaveBeenCalledWith(
				app,
				expect.objectContaining({ imports: [expect.objectContaining({ request: safeRequest })] }),
			);
			expect(provider.mock.calls.map(([input]) => input.id)).toEqual([safe.id]);
			expect(() => graph.seal()).not.toThrow();
			expect(() => graph.emit()).not.toThrow();
		},
	);

	it('accepts duplicate effective identities and ignores non-ESM decoys in a batch', async () => {
		const request = './styles.module.css';
		const safeRequest = './safe.module.css';
		const app = importer('duplicate-identity', [request, safeRequest]);
		const styles = module('stable-styles', EXPORTS);
		const duplicate = module(styles.id, EXPORTS);
		const decoy = module('commonjs-decoy', EXPORTS.replaceAll('mapped_', 'wrong_'));
		const safe = module('safe-styles', EXPORTS.replaceAll('mapped_', 'safe_'), {
			resource: '/project/safe.module.css',
		});
		const provider = vi.fn((_input: { id: string }) => undefined);
		const graph = harness({ option: provider }).createCompilation(
			[app, styles, duplicate, decoy, safe],
			new Map([
				[
					app.id,
					[
						edge(request, decoy, { category: 'commonjs' }),
						edge(request, styles),
						edge(request, duplicate),
						edge(safeRequest, safe),
					],
				],
			]),
		);

		await expect(graph.finish()).resolves.toBeUndefined();
		expect(provider.mock.calls.map(([input]) => input.id).sort()).toEqual(
			[safe.id, styles.id].sort(),
		);
		expect(() => graph.seal()).not.toThrow();
	});

	it('reacquires equivalent graph and module identities for batch verification', async () => {
		const requests = ['./styles.module.css', './safe.module.css'];
		const app = importer('fresh-identities', requests);
		const styles = module('fresh-styles', EXPORTS);
		const safe = module('fresh-safe', EXPORTS.replaceAll('mapped_', 'safe_'), {
			resource: '/project/safe.module.css',
		});
		const graph = harness().createCompilation(
			[app, styles, safe],
			new Map([[app.id, [edge(requests[0], styles), edge(requests[1], safe)]]]),
		);

		await graph.finish();
		const nextApp = importer(app.id, requests);
		nextApp.buildInfo[CSS_MODULE_BUILD_INFO_KEY] = structuredClone(
			app.buildInfo[CSS_MODULE_BUILD_INFO_KEY],
		);
		const nextStyles = module(styles.id, styles.source);
		const nextSafe = module(safe.id, safe.source, { resource: safe.resource });
		graph.compilation.modules = new Set([nextApp, nextStyles, nextSafe]);
		graph.compilation.moduleGraph = {
			getOutgoingConnections: (module: TestModule) =>
				module.id === nextApp.id
					? [edge(requests[0], nextStyles), edge(requests[1], nextSafe)]
					: [],
		};

		expect(() => graph.seal()).not.toThrow();
		expect(() => graph.emit()).not.toThrow();
	});

	it('rejects target changes from the current graph during batch verification', async () => {
		const requests = ['./styles.module.css', './safe.module.css'];
		const app = importer('changed-batch-target', requests);
		const styles = module('changed-batch-styles', EXPORTS);
		const safe = module('changed-batch-safe', EXPORTS.replaceAll('mapped_', 'safe_'), {
			resource: '/project/safe.module.css',
		});
		const replacement = module('replacement-safe', safe.source, { resource: safe.resource });
		const graph = harness().createCompilation(
			[app, styles, safe, replacement],
			new Map([[app.id, [edge(requests[0], styles), edge(requests[1], safe)]]]),
		);

		await graph.finish();
		graph.compilation.moduleGraph = {
			getOutgoingConnections: (module: TestModule) =>
				module.id === app.id ? [edge(requests[0], styles), edge(requests[1], replacement)] : [],
		};

		expect(() => graph.seal()).toThrow(CHANGED);
	});

	it('provides exact effective-module identities and read-only metadata', async () => {
		const a = importer('app-alpha', ['./styles.module.css?theme=one']);
		const b = importer('app-beta', ['./styles.module.css?theme=two']);
		const decoy = module('resolved-before-replacement', EXPORTS.replaceAll('mapped_', 'wrong_'));
		const alpha = module('javascript/auto|loader-a!styles.module.css?theme=one|alpha', EXPORTS, {
			resource: '/project/styles.module.css?theme=one',
			layer: 'alpha',
			buildInfo: {
				fileDependencies: new Set(['/project/styles.module.css', '/project/partial.css']),
				contextDependencies: new Set(['/project/themes']),
				missingDependencies: new Set(['/project/missing.css']),
				buildDependencies: new Set(['/project/css.config.js']),
				provider: { immutable: true },
			},
		});
		const beta = module(
			'javascript/auto|loader-b!styles.module.css?theme=two|beta',
			EXPORTS.replaceAll('mapped_', 'beta_'),
			{
				resource: '/project/styles.module.css?theme=two',
				layer: 'beta',
			},
		);
		const provider = vi.fn((_module: Record<string, any>) => undefined);
		const test = harness({ option: provider, environment: 'server' });
		const graph = test.createCompilation(
			[b, beta, a, alpha, decoy],
			new Map([
				[
					a.id,
					[edge(a.buildInfo[CSS_MODULE_BUILD_INFO_KEY].requests[0], alpha, { resolved: decoy })],
				],
				[b.id, [edge(b.buildInfo[CSS_MODULE_BUILD_INFO_KEY].requests[0], beta)]],
			]),
		);
		await graph.finish();
		await graph.finish();
		const inputs = new Map(provider.mock.calls.map(([input]) => [input.id, input]));
		expect(inputs.get(alpha.id)).toMatchObject({
			id: alpha.id,
			resource: alpha.resource,
			code: EXPORTS,
			meta: { provider: { immutable: true } },
			environment: 'server',
			layer: 'alpha',
			type: 'javascript/auto',
		});
		expect(inputs.get(beta.id)).toMatchObject({
			id: beta.id,
			resource: beta.resource,
			code: beta.source,
			environment: 'server',
			layer: 'beta',
			type: 'javascript/auto',
		});
		expect(inputs.has(decoy.id)).toBe(false);
		for (const [input] of provider.mock.calls) {
			expect(Object.isFrozen(input)).toBe(true);
			expect(Object.isFrozen(input.meta)).toBe(true);
		}
		graph.seal();
		graph.emit();
	});

	it('declines native CSS, ESM-looking assets, attributes, ambiguous targets, and CommonJS edges', async () => {
		const requests = [
			'./native.module.css',
			'./asset.module.css',
			'./attrs.module.css',
			'./ambiguous.module.css',
			'./require.module.css',
		];
		const app = importer('unsafe', requests);
		const native = module('native', EXPORTS, { type: 'css/module' });
		const asset = module('asset', EXPORTS, { type: 'asset/source' });
		const first = module('first', EXPORTS);
		const second = module('second', EXPORTS);
		const provider = vi.fn(() => ({ named: { root: 'mapped_root' } }));
		const graph = harness({ option: provider }).createCompilation(
			[app, native, asset, first, second],
			new Map([
				[
					app.id,
					[
						edge(requests[0], native),
						edge(requests[1], asset),
						edge(requests[2], first, { attributes: { type: 'css' } }),
						edge(requests[3], first),
						edge(requests[3], second),
						edge(requests[4], first, { category: 'commonjs' }),
					],
				],
			]),
		);
		await graph.finish();
		expect(provider).not.toHaveBeenCalled();
		graph.seal();
		graph.emit();
	});

	it('rejects provider values that disagree with the final module', async () => {
		const app = importer('default-map');
		const styles = module('default-provider', `export default { root: 'mapped_root' };`);
		const edges = new Map([[app.id, [edge('./styles.module.css', styles)]]]);
		const invalid = harness({
			option: () => ({ default: { root: 'stale_root' } }),
		}).createCompilation([app, styles], edges);
		await expect(invalid.finish()).rejects.toThrow(/invalid cssModuleConstants.*final module/);
	});

	it.each(['source', 'identity'] as const)(
		'rejects stale provider %s instead of publishing mismatched classes',
		async (change) => {
			const app = importer('stale');
			const styles = module('original-id', EXPORTS);
			const replacement = module('replacement-id', EXPORTS);
			const edges = new Map([[app.id, [edge('./styles.module.css', styles)]]]);
			const graph = harness().createCompilation([app, styles, replacement], edges, {
				afterRebuild() {
					if (change === 'source') styles.source = EXPORTS.replace('mapped_label', 'changed_label');
					else edges.set(app.id, [edge('./styles.module.css', replacement)]);
				},
			});
			await expect(graph.finish()).rejects.toThrow(CHANGED);
		},
	);

	it('rejects provider changes made by later module-finish work', async () => {
		const app = importer('late');
		const styles = module('styles', EXPORTS);
		const graph = harness().createCompilation(
			[app, styles],
			new Map([[app.id, [edge('./styles.module.css', styles)]]]),
		);
		await graph.finish();
		styles.source = EXPORTS.replace('mapped_root', 'late_root');
		expect(() => graph.seal()).toThrow(CHANGED);
	});

	it('rejects changes to surviving providers without rejecting pruned stylesheets', async () => {
		const app = importer('concatenated');
		const styles = module('styles', EXPORTS);
		const graph = harness().createCompilation(
			[app, styles],
			new Map([[app.id, [edge('./styles.module.css', styles)]]]),
		);
		await graph.finish();
		graph.seal();
		const replacement = module(styles.id, EXPORTS);
		const concatenated = { ...module('concatenation', ''), modules: [replacement] };
		graph.compilation.modules = new Set([concatenated]);
		graph.emit();
		replacement.source = EXPORTS.replace('mapped_label', 'after_seal');
		expect(() => graph.emit()).toThrow(CHANGED);
		graph.compilation.modules = new Set();
		expect(() => graph.emit()).not.toThrow();
	});

	it('does not reject changes to unused CSS imports', async () => {
		const app = importer('committed', ['./styles.module.css', './unused.module.css']);
		const styles = module('styles', EXPORTS);
		const unused = module('unused', EXPORTS, { resource: '/project/unused.module.css' });
		const graph = harness().createCompilation(
			[app, styles, unused],
			new Map([
				[app.id, [edge('./styles.module.css', styles), edge('./unused.module.css', unused)]],
			]),
			{ consume: () => ['./styles.module.css'] },
		);
		await graph.finish();
		unused.source = 'export const different = 1;';
		expect(() => graph.seal()).not.toThrow();
		expect(() => graph.emit()).not.toThrow();
	});

	it.each(['derived', 'cyclic'] as const)(
		'accepts %s providers without stale-class errors',
		async (kind) => {
			const app = importer('consumer', ['./derived.module.css']);
			const derived = importer('derived', ['./leaf.module.css']);
			derived.resource = '/project/derived.module.css';
			derived.source = EXPORTS;
			const leaf =
				kind === 'cyclic' ? importer('leaf', ['./derived.module.css']) : module('leaf', EXPORTS);
			leaf.resource = '/project/leaf.module.css';
			leaf.source = EXPORTS;
			const graph = harness().createCompilation(
				[app, derived, leaf],
				new Map([
					[app.id, [edge('./derived.module.css', derived)]],
					[derived.id, [edge('./leaf.module.css', leaf)]],
					...(kind === 'cyclic'
						? ([[leaf.id, [edge('./derived.module.css', derived)]]] as [string, TestEdge[]][])
						: []),
				]),
				{
					afterRebuild(current) {
						if (current.id === derived.id || (kind === 'cyclic' && current.id === leaf.id)) {
							current.source += '\n// transformed';
						}
					},
				},
			);
			await expect(graph.finish()).resolves.toBeUndefined();
			expect(() => graph.seal()).not.toThrow();
			expect(() => graph.emit()).not.toThrow();
		},
	);

	it('does not ask providers for facts in watch or development builds', async () => {
		const app = importer('watch');
		const styles = module('styles', EXPORTS);
		const edges = new Map([[app.id, [edge('./styles.module.css', styles)]]]);
		const provider = vi.fn(() => undefined);
		const watch = harness({ option: provider, watch: true }).createCompilation(
			[app, styles],
			edges,
		);
		await watch.finish();
		watch.seal();
		watch.emit();
		const dev = harness({ option: provider, mode: 'development' }).createCompilation(
			[app, styles],
			edges,
		);
		await dev.finish();
		dev.seal();
		dev.emit();
		expect(provider).not.toHaveBeenCalled();
	});
});
