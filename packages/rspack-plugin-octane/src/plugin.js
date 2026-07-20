import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	CLIENT_REFERENCE_MANIFEST_FILENAME,
	createClientReferenceManifest,
	createOctaneCompiler,
} from 'octane/compiler/bundler';
import {
	getOctaneRspackBuildInfo,
	inferRspackEnvironment,
	normalizePluginOptions,
} from './shared.js';

const PLUGIN_NAME = 'OctaneRspackPlugin';
const PROFILE_DEFINE = '__OCTANE_PROFILE_ENABLED__';
const DEVTOOLS_DEFINE = '__OCTANE_DEVTOOLS_ENABLED__';
const PLUGIN_VERSION = createRequire(import.meta.url)('../package.json').version;
const loaderPath = fileURLToPath(new URL('./loader.js', import.meta.url));
const OCTANE_RULE = /\.(?:tsrx|tsx|ts|js)$/i;
const TYPESCRIPT_RULE = /\.(?:tsrx|tsx|ts)$/i;

function realRoot(path) {
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
}

function addUniqueExtensions(resolveOptions) {
	const extensions = resolveOptions.extensions ?? ['.js', '.json', '.wasm'];
	resolveOptions.extensions = [
		...['.tsrx', '.tsx', '.ts'].filter((extension) => !extensions.includes(extension)),
		...extensions,
	];
}

function resolveRuntimeModule(request, root) {
	if (isAbsolute(request)) return request;
	try {
		return createRequire(join(root, 'package.json')).resolve(request);
	} catch {
		// Let Rspack produce its normal resolution diagnostic. This fallback also
		// keeps config inspection usable before peer dependencies are installed.
		return request;
	}
}

function addRuntimeAlias(resolveOptions, request, root) {
	const aliases = resolveOptions.alias === false ? {} : (resolveOptions.alias ?? {});
	resolveOptions.alias = {
		...aliases,
		octane$: resolveRuntimeModule(request, root),
		// Compiler-emitted metadata imports this public subpath directly. Pin it
		// alongside the runtime entry so raw/linked packages with their own nested
		// Octane copy cannot split metadata registration from runtime recording.
		'octane/profiling$': resolveRuntimeModule('octane/profiling', root),
	};
}

function projectRendererModule(request, root) {
	// Renderer config uses project-root IDs such as `/src/object-renderer.ts`.
	// They are never host-filesystem absolute paths, even if the same path happens
	// to exist on a developer machine or inside a container.
	return resolve(root, request.replace(/^[/\\]+/, ''));
}

function addProjectRendererAliases(resolveOptions, renderers, root) {
	if (renderers === undefined) return;
	const aliases = resolveOptions.alias === false ? {} : (resolveOptions.alias ?? {});
	const additions = {};
	for (const renderer of Object.values(renderers.registry)) {
		if (!renderer.module.startsWith('/')) continue;
		additions[`${renderer.module}$`] = projectRendererModule(renderer.module, root);
	}
	resolveOptions.alias = { ...aliases, ...additions };
}

function layerSpecializationCacheIdentity(layerSpecializations) {
	if (layerSpecializations === undefined) return undefined;
	return Object.fromEntries(
		Object.entries(layerSpecializations).map(([layer, specialization]) => [
			layer,
			{
				...(specialization.runtime === undefined ? null : { runtime: specialization.runtime }),
				...(specialization.renderers === undefined
					? null
					: { renderers: specialization.renderers.signature }),
				...(specialization.universalRuntime === undefined
					? null
					: { universalRuntime: specialization.universalRuntime }),
			},
		]),
	);
}

function createDiscoveryCompiler(options, root, profile, specialization) {
	const renderers = specialization?.renderers ?? options.renderers;
	const universalRuntime = specialization?.universalRuntime ?? options.universalRuntime;
	return createOctaneCompiler({
		root,
		profile,
		...(options.exclude === undefined ? null : { exclude: options.exclude }),
		...(renderers === undefined ? null : { renderers }),
		...(universalRuntime === undefined ? null : { universalRuntime }),
	});
}

function discoverAll(compilers) {
	if (compilers.length === 1) return compilers[0].discoverSourceDependencies();
	const packages = new Set();
	const dependencies = new Set();
	const missingDependencies = new Set();
	for (const compiler of compilers) {
		const discovery = compiler.discoverSourceDependencies();
		for (const value of discovery.packages ?? []) packages.add(value);
		for (const value of discovery.dependencies ?? []) dependencies.add(value);
		for (const value of discovery.missingDependencies ?? []) missingDependencies.add(value);
	}
	return {
		packages: [...packages].sort(),
		dependencies: [...dependencies].sort(),
		missingDependencies: [...missingDependencies].sort(),
	};
}

function addDependencies(collection, values) {
	if (!collection?.add) return;
	for (const value of values ?? []) collection.add(value);
}

function iterable(value) {
	return value && typeof value === 'object' && Symbol.iterator in value ? value : [];
}

function isJavaScriptAsset(filename) {
	return (
		/\.(?:c|m)?js(?:\?|$)/.test(filename) && !/\.hot-update\.(?:c|m)?js(?:\?|$)/.test(filename)
	);
}

function moduleChunks(compilation, module, inherited) {
	const chunks = new Set(inherited);
	for (const chunk of iterable(compilation.chunkGraph.getModuleChunksIterable(module)))
		chunks.add(chunk);
	return chunks;
}

function visitClientReferenceModules(
	compilation,
	module,
	inheritedChunks,
	visit,
	seen = new Set(),
) {
	if (!module || seen.has(module)) return;
	seen.add(module);
	const chunks = moduleChunks(compilation, module, inheritedChunks);
	visit(module, chunks);
	for (const child of iterable(module.modules)) {
		visitClientReferenceModules(compilation, child, chunks, visit, seen);
	}
	if (module.rootModule) {
		visitClientReferenceModules(compilation, module.rootModule, chunks, visit, seen);
	}
}

/** Emit the client-only module identity mapped to its concrete browser chunks. */
function emitClientReferenceManifest(compiler, compilation) {
	const entries = [];
	for (const topLevelModule of iterable(compilation.modules)) {
		visitClientReferenceModules(
			compilation,
			topLevelModule,
			[],
			(module, chunks) => {
				const reference = getOctaneRspackBuildInfo(module)?.clientReference;
				if (reference === undefined) return;
				const files = new Set();
				for (const chunk of chunks) {
					for (const file of iterable(chunk?.files)) {
						const filename = String(file);
						if (isJavaScriptAsset(filename)) files.add(filename);
					}
				}
				entries.push({ reference, chunks: files });
			},
			new Set(),
		);
	}
	const manifest = createClientReferenceManifest(entries);
	if (Object.keys(manifest.references).length === 0) return;
	const source = JSON.stringify(manifest, null, 2) + '\n';
	compilation.emitAsset(
		CLIENT_REFERENCE_MANIFEST_FILENAME,
		new compiler.webpack.sources.RawSource(source),
	);
}

function defineMatchesBoolean(value, expected) {
	return value === expected || value === JSON.stringify(expected);
}

function assertReservedDefineAvailable(compiler, define, enabled, conflict) {
	for (const plugin of compiler.options.plugins ?? []) {
		// Rspack's DefinePlugin keeps its constructor argument in `_args`. Inspecting
		// the configured plugin list catches conflicts regardless of apply order;
		// otherwise DefinePlugin keeps the first value and emits only a warning,
		// which can leave compiler metadata and runtime specialization out of sync.
		const definitions = plugin?._args?.[0];
		if (
			definitions === null ||
			typeof definitions !== 'object' ||
			!Object.prototype.hasOwnProperty.call(definitions, define)
		) {
			continue;
		}
		if (!defineMatchesBoolean(definitions[define], enabled)) {
			throw new TypeError(
				`@octanejs/rspack-plugin: ${define} is reserved by Octane and ${conflict}. Remove the custom DefinePlugin entry.`,
			);
		}
	}
}

function assertProfilingDefineAvailable(compiler, enabled) {
	assertReservedDefineAvailable(
		compiler,
		PROFILE_DEFINE,
		enabled,
		`conflicts with \`profile: ${enabled}\` — configure profiling through OctaneRspackPlugin instead`,
	);
	// The Vite metaframework owns the dev-server devtools story (panel injection
	// + snapshot relay); Rspack bundles pin the constant false so the runtime's
	// devtools branches — and their profiling imports — erase from every build.
	assertReservedDefineAvailable(
		compiler,
		DEVTOOLS_DEFINE,
		false,
		'pinned false here: Octane DevTools is not yet supported on the Rspack/Rsbuild integrations (use the Vite integration for devtools)',
	);
}

function installProfilingDefine(compiler, enabled) {
	const DefinePlugin = compiler.webpack?.DefinePlugin;
	if (typeof DefinePlugin !== 'function') {
		throw new TypeError(
			'@octanejs/rspack-plugin: this Rspack compiler does not expose webpack.DefinePlugin.',
		);
	}
	new DefinePlugin({
		[PROFILE_DEFINE]: JSON.stringify(enabled),
		[DEVTOOLS_DEFINE]: 'false',
	}).apply(compiler);
}

function hasHotModuleReplacement(compiler) {
	return (compiler.options.plugins ?? []).some(
		(plugin) => plugin?.name === 'HotModuleReplacementPlugin',
	);
}

function saltPersistentCacheVersion(compiler, inputs) {
	const cache = compiler.options.cache;
	if (cache === null || typeof cache !== 'object' || cache.type !== 'persistent') return;
	const digest = createHash('sha256')
		.update(JSON.stringify({ pluginVersion: PLUGIN_VERSION, ...inputs }))
		.digest('hex')
		.slice(0, 16);
	const octaneVersion = `octane-rspack@${PLUGIN_VERSION}:${digest}`;
	cache.version = cache.version ? `${cache.version}|${octaneVersion}` : octaneVersion;
}

export class OctaneRspackPlugin {
	constructor(options = {}) {
		this.options = normalizePluginOptions(options);
		this.sourceDependencies = [];
	}

	apply(compiler) {
		const configuredRoot = this.options.root;
		const compilerRoot = compiler.options.context ?? process.cwd();
		const root = realRoot(
			configuredRoot
				? isAbsolute(configuredRoot)
					? configuredRoot
					: resolve(compilerRoot, configuredRoot)
				: compilerRoot,
		);
		const environment = this.options.environment ?? inferRspackEnvironment(compiler.options.target);
		const profile = environment === 'client' && this.options.profile === true;
		const hmr =
			environment === 'client' && hasHotModuleReplacement(compiler) && this.options.hmr !== false;
		const dev =
			environment === 'client' &&
			(this.options.dev ??
				(compiler.options.mode === undefined || compiler.options.mode !== 'production'));
		assertProfilingDefineAvailable(compiler, profile);
		saltPersistentCacheVersion(compiler, {
			root,
			environment,
			hmr,
			dev,
			profile,
			exclude: this.options.exclude ?? [],
			renderers: this.options.renderers?.signature,
			runtime: this.options.runtime,
			universalRuntime: this.options.universalRuntime,
			layerSpecializations: layerSpecializationCacheIdentity(this.options.layerSpecializations),
			// Ownership flips which modules compile vs pass through — cached
			// transform results must not survive a requireDirective toggle.
			requireDirective: this.options.requireDirective === true,
			transpile: this.options.transpile !== false,
		});
		installProfilingDefine(compiler, profile);
		const neutralCompiler = createDiscoveryCompiler(this.options, root, profile);
		const discoveryCompilers = [neutralCompiler];
		for (const specialization of Object.values(this.options.layerSpecializations ?? {})) {
			discoveryCompilers.push(createDiscoveryCompiler(this.options, root, profile, specialization));
		}
		const runtimeRequest =
			this.options.runtime ?? neutralCompiler.resolveRuntimeRequest('octane', environment);

		compiler.options.resolve ??= {};
		addUniqueExtensions(compiler.options.resolve);
		addRuntimeAlias(compiler.options.resolve, runtimeRequest, root);
		addProjectRendererAliases(compiler.options.resolve, this.options.renderers, root);
		for (const specialization of Object.values(this.options.layerSpecializations ?? {})) {
			addProjectRendererAliases(compiler.options.resolve, specialization.renderers, root);
		}

		compiler.options.module ??= {};
		compiler.options.module.rules ??= [];
		const loaderOptions = {
			root,
			environment,
			profile,
			...(this.options.hmr === undefined ? null : { hmr: this.options.hmr }),
			...(this.options.dev === undefined ? null : { dev: this.options.dev }),
			...(this.options.exclude === undefined ? null : { exclude: this.options.exclude }),
			...(this.options.renderers === undefined ? null : { renderers: this.options.renderers }),
			...(this.options.universalRuntime === undefined
				? null
				: { universalRuntime: this.options.universalRuntime }),
			...(this.options.layerSpecializations === undefined
				? null
				: { layerSpecializations: this.options.layerSpecializations }),
			...(this.options.requireDirective === undefined
				? null
				: { requireDirective: this.options.requireDirective }),
		};
		compiler.options.module.rules.push({
			test: OCTANE_RULE,
			type: 'javascript/auto',
			enforce: 'pre',
			use: [{ loader: loaderPath, options: loaderOptions }],
		});
		if (this.options.transpile !== false) {
			compiler.options.module.rules.push({
				test: TYPESCRIPT_RULE,
				type: 'javascript/auto',
				use: [{ loader: 'builtin:swc-loader', options: { detectSyntax: 'auto' } }],
			});
		}
		for (const [layer, specialization] of Object.entries(this.options.layerSpecializations ?? {})) {
			if (specialization.runtime === undefined) continue;
			compiler.options.module.rules.push({
				issuerLayer: layer,
				resolve: {
					alias: {
						octane$: resolveRuntimeModule(specialization.runtime, root),
					},
				},
			});
		}

		let discovery;
		const discover = () => {
			if (discovery === undefined) {
				discovery = discoverAll(discoveryCompilers);
				this.sourceDependencies = Object.freeze([...(discovery.packages ?? [])]);
			}
			return discovery;
		};
		compiler.hooks.invalid?.tap(PLUGIN_NAME, (filename) => {
			for (const current of discoveryCompilers) current.invalidate(filename);
			discovery = undefined;
		});
		compiler.hooks.watchRun?.tap(PLUGIN_NAME, () => {
			for (const current of discoveryCompilers) current.invalidate();
			discovery = undefined;
		});
		compiler.hooks.thisCompilation?.tap(PLUGIN_NAME, (compilation) => {
			const current = discover();
			addDependencies(compilation.fileDependencies, current.dependencies);
			addDependencies(compilation.missingDependencies, current.missingDependencies);
			if (environment === 'client') {
				compilation.hooks.processAssets.tap(
					{
						name: PLUGIN_NAME,
						stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT,
					},
					() => emitClientReferenceManifest(compiler, compilation),
				);
			}
		});
	}
}

export function octaneRspack(options) {
	return new OctaneRspackPlugin(options);
}
