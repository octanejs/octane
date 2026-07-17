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

function assertProfilingDefineAvailable(compiler, enabled) {
	for (const plugin of compiler.options.plugins ?? []) {
		// Rspack's DefinePlugin keeps its constructor argument in `_args`. Inspecting
		// the configured plugin list catches conflicts regardless of apply order;
		// otherwise DefinePlugin keeps the first value and emits only a warning,
		// which can leave compiler metadata and runtime specialization out of sync.
		const definitions = plugin?._args?.[0];
		if (
			definitions === null ||
			typeof definitions !== 'object' ||
			!Object.prototype.hasOwnProperty.call(definitions, PROFILE_DEFINE)
		) {
			continue;
		}
		if (!defineMatchesBoolean(definitions[PROFILE_DEFINE], enabled)) {
			throw new TypeError(
				`@octanejs/rspack-plugin: ${PROFILE_DEFINE} is reserved by Octane and conflicts with \`profile: ${enabled}\`. Remove the custom DefinePlugin entry and configure profiling through OctaneRspackPlugin.`,
			);
		}
	}
}

function installProfilingDefine(compiler, enabled) {
	const DefinePlugin = compiler.webpack?.DefinePlugin;
	if (typeof DefinePlugin !== 'function') {
		throw new TypeError(
			'@octanejs/rspack-plugin: this Rspack compiler does not expose webpack.DefinePlugin.',
		);
	}
	new DefinePlugin({ [PROFILE_DEFINE]: JSON.stringify(enabled) }).apply(compiler);
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
			// Ownership flips which modules compile vs pass through — cached
			// transform results must not survive a requireDirective toggle.
			requireDirective: this.options.requireDirective === true,
			transpile: this.options.transpile !== false,
		});
		installProfilingDefine(compiler, profile);
		const neutralCompiler = createOctaneCompiler({
			root,
			profile,
			...(this.options.exclude === undefined ? null : { exclude: this.options.exclude }),
			...(this.options.renderers === undefined ? null : { renderers: this.options.renderers }),
		});
		const runtimeRequest = neutralCompiler.resolveRuntimeRequest('octane', environment);

		compiler.options.resolve ??= {};
		addUniqueExtensions(compiler.options.resolve);
		addRuntimeAlias(compiler.options.resolve, runtimeRequest, root);
		addProjectRendererAliases(compiler.options.resolve, this.options.renderers, root);

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

		let discovery;
		const discover = () => {
			if (discovery === undefined) {
				discovery = neutralCompiler.discoverSourceDependencies();
				this.sourceDependencies = Object.freeze([...(discovery.packages ?? [])]);
			}
			return discovery;
		};
		compiler.hooks.invalid?.tap(PLUGIN_NAME, (filename) => {
			neutralCompiler.invalidate(filename);
			discovery = undefined;
		});
		compiler.hooks.watchRun?.tap(PLUGIN_NAME, () => {
			neutralCompiler.invalidate();
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
