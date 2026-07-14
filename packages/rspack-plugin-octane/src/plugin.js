import { createRequire } from 'node:module';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOctaneCompiler } from 'octane/compiler/bundler';
import { inferRspackEnvironment, normalizePluginOptions } from './shared.js';

const PLUGIN_NAME = 'OctaneRspackPlugin';
const loaderPath = fileURLToPath(new URL('./loader.js', import.meta.url));
const OCTANE_RULE = /\.(?:tsrx|tsx|ts|js)$/i;
const TYPESCRIPT_RULE = /\.(?:tsrx|tsx|ts)$/i;

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
	};
}

function addDependencies(collection, values) {
	if (!collection?.add) return;
	for (const value of values ?? []) collection.add(value);
}

export class OctaneRspackPlugin {
	constructor(options = {}) {
		this.options = normalizePluginOptions(options);
		this.sourceDependencies = [];
	}

	apply(compiler) {
		const configuredRoot = this.options.root;
		const compilerRoot = compiler.options.context ?? process.cwd();
		const root = configuredRoot
			? isAbsolute(configuredRoot)
				? configuredRoot
				: resolve(compilerRoot, configuredRoot)
			: compilerRoot;
		const environment = this.options.environment ?? inferRspackEnvironment(compiler.options.target);
		const neutralCompiler = createOctaneCompiler({
			root,
			...(this.options.exclude === undefined ? null : { exclude: this.options.exclude }),
			...(this.options.parallelUse === undefined
				? null
				: { parallelUse: this.options.parallelUse }),
		});
		const runtimeRequest = neutralCompiler.resolveRuntimeRequest('octane', environment);

		compiler.options.resolve ??= {};
		addUniqueExtensions(compiler.options.resolve);
		addRuntimeAlias(compiler.options.resolve, runtimeRequest, root);

		compiler.options.module ??= {};
		compiler.options.module.rules ??= [];
		const loaderOptions = {
			root,
			environment,
			...(this.options.hmr === undefined ? null : { hmr: this.options.hmr }),
			...(this.options.dev === undefined ? null : { dev: this.options.dev }),
			...(this.options.parallelUse === undefined
				? null
				: { parallelUse: this.options.parallelUse }),
			...(this.options.exclude === undefined ? null : { exclude: this.options.exclude }),
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
		});
	}
}

export function octaneRspack(options) {
	return new OctaneRspackPlugin(options);
}
