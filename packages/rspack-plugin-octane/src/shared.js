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
	'universalRuntime',
	'layerSpecializations',
]);
const PLUGIN_OPTION_KEYS = new Set([...LOADER_OPTION_KEYS, 'runtime', 'transpile']);
const LAYER_SPECIALIZATION_KEYS = new Set(['runtime', 'renderers', 'universalRuntime']);

function normalizeRuntimeRequest(value, label = 'runtime') {
	if (value !== undefined && (typeof value !== 'string' || value.trim() !== value || !value)) {
		throw new TypeError(
			`@octanejs/rspack-plugin: \`${label}\` must be a non-empty module request string.`,
		);
	}
	return value;
}

function normalizeUniversalRuntime(value) {
	if (value === undefined) return undefined;
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError('@octanejs/rspack-plugin: `universalRuntime` must be an object.');
	}
	for (const key of Object.keys(value)) {
		if (key !== 'runtime' && key !== 'thread') {
			throw new TypeError(`@octanejs/rspack-plugin: unknown \`universalRuntime.${key}\` option.`);
		}
	}
	if (
		typeof value.runtime !== 'string' ||
		!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(value.runtime)
	) {
		throw new TypeError(
			'@octanejs/rspack-plugin: `universalRuntime.runtime` must be a lowercase runtime ID.',
		);
	}
	if (value.thread !== 'background' && value.thread !== 'main-thread') {
		throw new TypeError(
			'@octanejs/rspack-plugin: `universalRuntime.thread` must be "background" or "main-thread".',
		);
	}
	return Object.freeze({ runtime: value.runtime, thread: value.thread });
}

function normalizeLayerSpecializations(value) {
	if (value === undefined) return undefined;
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError('@octanejs/rspack-plugin: `layerSpecializations` must be an object map.');
	}
	const entries = Object.entries(value).sort(([left], [right]) =>
		left < right ? -1 : left > right ? 1 : 0,
	);
	const normalized = [];
	for (const [layer, specialization] of entries) {
		if (!layer || layer.trim() !== layer) {
			throw new TypeError(
				'@octanejs/rspack-plugin: `layerSpecializations` keys must be non-empty layer names without surrounding whitespace.',
			);
		}
		if (
			specialization === null ||
			typeof specialization !== 'object' ||
			Array.isArray(specialization)
		) {
			throw new TypeError(
				`@octanejs/rspack-plugin: \`layerSpecializations.${layer}\` must be an object.`,
			);
		}
		for (const key of Object.keys(specialization)) {
			if (!LAYER_SPECIALIZATION_KEYS.has(key)) {
				throw new TypeError(
					`@octanejs/rspack-plugin: unknown \`layerSpecializations.${layer}.${key}\` option.`,
				);
			}
		}
		const runtime = normalizeRuntimeRequest(
			specialization.runtime,
			`layerSpecializations.${layer}.runtime`,
		);
		const renderers =
			specialization.renderers === undefined
				? undefined
				: normalizeRendererConfig(specialization.renderers);
		const universalRuntime = normalizeUniversalRuntime(specialization.universalRuntime);
		normalized.push([
			layer,
			Object.freeze({
				...(runtime === undefined ? null : { runtime }),
				...(renderers === undefined ? null : { renderers }),
				...(universalRuntime === undefined ? null : { universalRuntime }),
			}),
		]);
	}
	return Object.freeze(Object.fromEntries(normalized));
}

/** Select the compiler-facing options for a module's Rspack layer. */
export function selectLayerCompilerOptions(options, module) {
	const layer = typeof module?.layer === 'string' ? module.layer : undefined;
	const specialization = layer === undefined ? undefined : options.layerSpecializations?.[layer];
	return {
		renderers: specialization?.renderers ?? options.renderers,
		universalRuntime: specialization?.universalRuntime ?? options.universalRuntime,
	};
}

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
	if (plugin) normalizeRuntimeRequest(options.runtime);
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
	const universalRuntime = normalizeUniversalRuntime(options.universalRuntime);
	const layerSpecializations = normalizeLayerSpecializations(options.layerSpecializations);

	const normalized = {
		...(options.root === undefined ? null : { root: options.root }),
		...(options.environment === undefined ? null : { environment: options.environment }),
		...(options.hmr === undefined ? null : { hmr: options.hmr }),
		...(options.dev === undefined ? null : { dev: options.dev }),
		...(options.profile === undefined ? null : { profile: options.profile }),
		...(options.exclude === undefined ? null : { exclude: [...options.exclude] }),
		...(renderers === undefined ? null : { renderers }),
		...(universalRuntime === undefined ? null : { universalRuntime }),
		...(layerSpecializations === undefined ? null : { layerSpecializations }),
		...(options.requireDirective === undefined
			? null
			: { requireDirective: options.requireDirective }),
		...(plugin && options.transpile !== undefined ? { transpile: options.transpile } : null),
		...(plugin && options.runtime !== undefined ? { runtime: options.runtime } : null),
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
	const universalRuntimeValid =
		value?.universalRuntime !== null &&
		typeof value?.universalRuntime === 'object' &&
		typeof value.universalRuntime.runtime === 'string' &&
		(value.universalRuntime.thread === 'background' ||
			value.universalRuntime.thread === 'main-thread');
	if (
		value &&
		typeof value === 'object' &&
		typeof value.canonicalId === 'string' &&
		(value.transformKind === 'compile' ||
			value.transformKind === 'slots' ||
			value.transformKind === 'client-only-stub') &&
		typeof value.serverRpc === 'boolean' &&
		(value.clientReference === undefined || nestedReferenceValid) &&
		(value.universalRuntime === undefined || universalRuntimeValid)
	) {
		return value;
	}
	return null;
}
