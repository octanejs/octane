import { normalizeRendererConfig } from 'octane/compiler/renderers';

const CLIENT_TARGETS = new Set(['web', 'webworker', 'electron-renderer', 'browserslist']);

function targetValues(target) {
	if (Array.isArray(target)) return target.flatMap(targetValues);
	return typeof target === 'string' ? [target.toLowerCase()] : [];
}

/**
 * Infer which Octane runtime a Rspack compilation consumes. Explicit plugin
 * options remain authoritative; this helper covers Rspack's standard target
 * names when the environment is omitted.
 */
export function inferRspackEnvironment(target) {
	const values = targetValues(target);
	for (const value of values) {
		if (
			value === 'node' ||
			value.startsWith('node') ||
			value === 'async-node' ||
			value.startsWith('async-node') ||
			value === 'electron-main' ||
			value === 'electron-preload' ||
			value === 'nwjs' ||
			value.startsWith('nwjs')
		) {
			return 'server';
		}
	}
	for (const value of values) {
		if (CLIENT_TARGETS.has(value) || value.startsWith('web')) return 'client';
	}
	return 'client';
}

const LOADER_OPTION_KEYS = new Set([
	'root',
	'environment',
	'hmr',
	'dev',
	'profile',
	'exclude',
	'renderers',
	'requireDirective',
]);
const PLUGIN_OPTION_KEYS = new Set([...LOADER_OPTION_KEYS, 'transpile']);

function assertBooleanOption(options, key) {
	if (options[key] !== undefined && typeof options[key] !== 'boolean') {
		throw new TypeError(`@octanejs/rspack-plugin: \`${key}\` must be a boolean.`);
	}
}

function normalizeOptions(value, plugin) {
	const options = value ?? {};
	if (typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('@octanejs/rspack-plugin: options must be an object.');
	}
	const allowed = plugin ? PLUGIN_OPTION_KEYS : LOADER_OPTION_KEYS;
	for (const key of Object.keys(options)) {
		if (!allowed.has(key)) {
			throw new TypeError(`@octanejs/rspack-plugin: unknown option \`${key}\`.`);
		}
	}
	if (options.root !== undefined && typeof options.root !== 'string') {
		throw new TypeError('@octanejs/rspack-plugin: `root` must be a path string.');
	}
	if (
		options.environment !== undefined &&
		options.environment !== 'client' &&
		options.environment !== 'server'
	) {
		throw new TypeError('@octanejs/rspack-plugin: `environment` must be "client" or "server".');
	}
	assertBooleanOption(options, 'hmr');
	assertBooleanOption(options, 'dev');
	assertBooleanOption(options, 'profile');
	assertBooleanOption(options, 'requireDirective');
	if (
		options.exclude !== undefined &&
		(!Array.isArray(options.exclude) || options.exclude.some((entry) => typeof entry !== 'string'))
	) {
		throw new TypeError('@octanejs/rspack-plugin: `exclude` must be an array of path strings.');
	}
	if (plugin) assertBooleanOption(options, 'transpile');
	const renderers =
		options.renderers === undefined ? undefined : normalizeRendererConfig(options.renderers);

	const normalized = {
		...(options.root === undefined ? null : { root: options.root }),
		...(options.environment === undefined ? null : { environment: options.environment }),
		...(options.hmr === undefined ? null : { hmr: options.hmr }),
		...(options.dev === undefined ? null : { dev: options.dev }),
		...(options.profile === undefined ? null : { profile: options.profile }),
		...(options.exclude === undefined ? null : { exclude: [...options.exclude] }),
		...(renderers === undefined ? null : { renderers }),
		...(options.requireDirective === undefined
			? null
			: { requireDirective: options.requireDirective }),
		...(plugin && options.transpile !== undefined ? { transpile: options.transpile } : null),
	};
	if (normalized.exclude) Object.freeze(normalized.exclude);
	return Object.freeze(normalized);
}

export function normalizeLoaderOptions(value) {
	return normalizeOptions(value, false);
}

export function normalizePluginOptions(value) {
	return normalizeOptions(value, true);
}

/** Read the serializable metadata attached to an Octane-transformed module. */
export function getOctaneRspackBuildInfo(module) {
	const value = module?.buildInfo?.octane;
	const nestedReferenceValid =
		value?.clientReference !== null &&
		typeof value?.clientReference === 'object' &&
		typeof value.clientReference.id === 'string' &&
		typeof value.clientReference.moduleId === 'string' &&
		typeof value.clientReference.renderer === 'string';
	if (
		value &&
		typeof value === 'object' &&
		typeof value.canonicalId === 'string' &&
		(value.transformKind === 'compile' ||
			value.transformKind === 'slots' ||
			value.transformKind === 'client-only-stub') &&
		typeof value.serverRpc === 'boolean' &&
		(value.clientReference === undefined || nestedReferenceValid)
	) {
		return value;
	}
	return null;
}
