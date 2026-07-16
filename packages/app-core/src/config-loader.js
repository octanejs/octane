// @ts-check

/**
 * Bundler-neutral loading for `octane.config.ts`.
 *
 * Development integrations can inject their own module runner so config
 * modules participate in the integration's native graph and invalidation.
 * Build tools and CLIs use the esbuild evaluator, which bundles local config
 * helpers, compiles imported `.tsrx` files for the server, and reports every
 * file consulted for watch/cache invalidation.
 */

/** @import { OctaneConfigOptions, ResolvedOctaneConfig } from '@octanejs/app-core' */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { builtinModules, createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';
import { compile } from 'octane/compiler';

import { resolveOctaneConfig } from './resolve-config.js';

const DEFAULT_CONFIG_FILE = 'octane.config.ts';
const OCTANE_EXTENSION_PATTERN = /\.tsrx$/;
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((id) => `node:${id}`)]);

// Validation + defaults have no compiler transform/esbuild imports and remain
// safe to include in production server bundles. Their renderer config helper
// is a dependency-free compiler subpath.
export { resolveOctaneConfig } from './resolve-config.js';

/**
 * @typedef {Object} ConfigModuleRunner
 * @property {(id: string) => Promise<Record<string, unknown>>} loadModule
 * @property {((id: string) => string[] | Promise<string[]>)} [getDependencies]
 * @property {((id: string) => string[] | Promise<string[]>)} [getMissingDependencies]
 */

/**
 * @typedef {Object} LoadConfigOptions
 * @property {string} [configFile] Relative to `projectRoot`, or absolute
 * @property {boolean} [requireAdapter]
 * @property {ConfigModuleRunner | ((id: string) => Promise<Record<string, unknown>>)} [moduleRunner]
 * @property {string} [cacheDir] Directory for the evaluated ESM module
 */

/**
 * @typedef {Object} LoadedOctaneConfig
 * @property {ResolvedOctaneConfig} config
 * @property {string} configPath
 * @property {string[]} dependencies Existing files that affect the config
 * @property {string[]} missingDependencies Unresolved files/specifiers consulted while loading
 */

/**
 * Return the absolute config path for a project.
 *
 * @param {string} projectRoot
 * @param {string} [configFile]
 * @returns {string}
 */
export function getOctaneConfigPath(projectRoot, configFile = DEFAULT_CONFIG_FILE) {
	return path.resolve(projectRoot, configFile);
}

/**
 * @param {string} projectRoot
 * @param {string} [configFile]
 * @returns {boolean}
 */
export function octaneConfigExists(projectRoot, configFile = DEFAULT_CONFIG_FILE) {
	return fs.existsSync(getOctaneConfigPath(projectRoot, configFile));
}

/**
 * Load, validate, and resolve `octane.config.ts`.
 *
 * @param {string} projectRoot
 * @param {LoadConfigOptions} [options]
 * @returns {Promise<ResolvedOctaneConfig>}
 */
export async function loadOctaneConfig(projectRoot, options = {}) {
	return (await loadOctaneConfigWithMetadata(projectRoot, options)).config;
}

/**
 * Load a config and return the dependency metadata an integration needs to
 * invalidate its cache and register watch dependencies.
 *
 * @param {string} projectRoot
 * @param {LoadConfigOptions} [options]
 * @returns {Promise<LoadedOctaneConfig>}
 */
export async function loadOctaneConfigWithMetadata(projectRoot, options = {}) {
	const root = path.resolve(projectRoot);
	const configPath = getOctaneConfigPath(root, options.configFile);
	if (!fs.existsSync(configPath)) {
		throw new Error(`[octane] ${path.basename(configPath)} not found in ${root}`);
	}

	if (options.moduleRunner) {
		const runner = options.moduleRunner;
		const loadModule = typeof runner === 'function' ? runner : runner.loadModule.bind(runner);
		const configModule = await loadModule(configPath);
		const runnerDependencies =
			typeof runner === 'object' && runner.getDependencies
				? await runner.getDependencies(configPath)
				: [];
		const runnerMissingDependencies =
			typeof runner === 'object' && runner.getMissingDependencies
				? await runner.getMissingDependencies(configPath)
				: [];
		return {
			config: resolveOctaneConfig(/** @type {OctaneConfigOptions} */ (configModule.default), {
				requireAdapter: options.requireAdapter,
			}),
			configPath,
			dependencies: sortUnique([configPath, ...runnerDependencies]),
			missingDependencies: sortUnique(runnerMissingDependencies),
		};
	}

	const evaluated = await evaluateConfigModule(root, configPath, options.cacheDir);
	return {
		config: resolveOctaneConfig(/** @type {OctaneConfigOptions} */ (evaluated.module.default), {
			requireAdapter: options.requireAdapter,
		}),
		configPath,
		dependencies: evaluated.dependencies,
		missingDependencies: evaluated.missingDependencies,
	};
}

/**
 * @param {string} root
 * @param {string} configPath
 * @param {string | undefined} configuredCacheDir
 */
async function evaluateConfigModule(root, configPath, configuredCacheDir) {
	const dependencies = new Set([configPath]);
	const missingDependencies = new Set();
	const packageRequire = createRequire(configPath);

	/** @type {import('esbuild').Plugin} */
	const dependencyPlugin = {
		name: 'octane-config-dependencies',
		setup(buildApi) {
			buildApi.onResolve({ filter: /.*/ }, (args) => {
				if (BUILTINS.has(args.path)) return null;
				// Preserve lazy config imports instead of traversing an application's
				// renderer graph during config evaluation. Dev integrations execute
				// these through their native module runner; the neutral evaluator only
				// needs the declarative config object now. Absolute file URLs keep the
				// lazy reference stable when the evaluated module lives in a cache dir.
				if (args.kind === 'dynamic-import' && !isBareSpecifier(args.path)) {
					const candidate = path.resolve(args.resolveDir, args.path);
					const resolved = resolveLocalCandidate(candidate);
					if (resolved) {
						dependencies.add(resolved);
						return { path: pathToFileURL(resolved).href, external: true };
					}
					missingDependencies.add(candidate);
					return { path: args.path, external: true };
				}
				if (isBareSpecifier(args.path)) {
					try {
						const resolved = packageRequire.resolve(args.path);
						dependencies.add(resolved);
						const packageJson = findPackageJson(resolved);
						if (packageJson) dependencies.add(packageJson);
					} catch {
						missingDependencies.add(args.path);
					}
					return null;
				}

				if (args.kind === 'entry-point') return null;
				const candidate = path.resolve(args.resolveDir, args.path);
				if (!resolveLocalCandidate(candidate)) missingDependencies.add(candidate);
				return null;
			});

			buildApi.onLoad({ filter: OCTANE_EXTENSION_PATTERN }, async (args) => {
				dependencies.add(args.path);
				const source = await fs.promises.readFile(args.path, 'utf8');
				const filename = path.relative(root, args.path).split(path.sep).join('/');
				const result = compile(source, filename, { mode: 'server', hmr: false });
				return {
					contents: typeof result === 'string' ? result : result.code,
					loader: 'js',
					resolveDir: path.dirname(args.path),
				};
			});
		},
	};

	let result;
	try {
		result = await build({
			absWorkingDir: root,
			entryPoints: [configPath],
			bundle: true,
			format: 'esm',
			platform: 'node',
			target: 'node22',
			packages: 'external',
			metafile: true,
			sourcemap: 'inline',
			write: false,
			plugins: [dependencyPlugin],
			logLevel: 'silent',
		});
	} catch (error) {
		attachDependencyMetadata(error, dependencies, missingDependencies);
		throw error;
	}

	for (const input of Object.keys(result.metafile.inputs)) {
		const filename = path.isAbsolute(input) ? input : path.resolve(root, input);
		if (fs.existsSync(filename)) dependencies.add(filename);
	}

	const output = result.outputFiles[0]?.text;
	if (!output) throw new Error('[octane] Config evaluation produced no JavaScript output.');

	const cacheDir = configuredCacheDir
		? path.resolve(root, configuredCacheDir)
		: path.join(root, 'node_modules/.cache/octane/config');
	const outputPath = path.join(cacheDir, 'octane.config.mjs');
	fs.mkdirSync(cacheDir, { recursive: true });
	if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== output) {
		fs.writeFileSync(outputPath, output);
	}
	const contentHash = createHash('sha256').update(output).digest('hex').slice(0, 16);
	let configModule;
	try {
		configModule = await import(`${pathToFileURL(outputPath).href}?v=${contentHash}`);
	} catch (error) {
		attachDependencyMetadata(error, dependencies, missingDependencies);
		throw error;
	}

	return {
		module: configModule,
		dependencies: sortUnique(dependencies),
		missingDependencies: sortUnique(missingDependencies),
	};
}

/** @param {string} specifier */
function isBareSpecifier(specifier) {
	return (
		!specifier.startsWith('.') && !path.isAbsolute(specifier) && !specifier.startsWith('file:')
	);
}

/** @param {string} candidate */
function resolveLocalCandidate(candidate) {
	for (const filename of [
		candidate,
		`${candidate}.ts`,
		`${candidate}.tsx`,
		`${candidate}.tsrx`,
		`${candidate}.js`,
		`${candidate}.mjs`,
		`${candidate}.cjs`,
		path.join(candidate, 'index.ts'),
		path.join(candidate, 'index.tsx'),
		path.join(candidate, 'index.tsrx'),
		path.join(candidate, 'index.js'),
	]) {
		if (fs.existsSync(filename)) return filename;
	}
	return null;
}

/** @param {string} filename */
function findPackageJson(filename) {
	let current = path.dirname(filename);
	for (;;) {
		const candidate = path.join(current, 'package.json');
		if (fs.existsSync(candidate)) return candidate;
		const parent = path.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

/** @param {Iterable<string>} values */
function sortUnique(values) {
	return [...new Set(values)].sort();
}

/**
 * @param {unknown} error
 * @param {Set<string>} dependencies
 * @param {Set<string>} missingDependencies
 */
function attachDependencyMetadata(error, dependencies, missingDependencies) {
	if (!error || typeof error !== 'object') return;
	Object.assign(error, {
		dependencies: sortUnique(dependencies),
		missingDependencies: sortUnique(missingDependencies),
	});
}
