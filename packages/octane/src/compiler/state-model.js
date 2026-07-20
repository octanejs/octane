/**
 * Serializable state-model configuration shared by app and bundler integrations.
 *
 * Keep this module dependency-free: app config is normalized in production
 * server bundles, while compiler integrations use the same canonical data for
 * cache keys and per-package source classification.
 */

export const DEFAULT_STATE_MODEL = 'permissive';
export const STATE_MODEL_CONFIG_VERSION = 1;

/** @typedef {'causal' | 'permissive'} StateModel */
/** @typedef {Readonly<{ default: StateModel, packages: Readonly<Record<string, StateModel>>, signature: string }>} ResolvedStateModelConfig */

const CONFIG_KEYS = new Set(['default', 'packages', 'signature']);
const STATE_MODELS = new Set(['causal', 'permissive']);

function configError(message) {
	return new Error(`octane/compiler/state-model: ${message}`);
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @param {string} path @returns {StateModel} */
function validateStateModel(value, path) {
	if (typeof value !== 'string' || !STATE_MODELS.has(value)) {
		throw configError(`${path} must be "causal" or "permissive".`);
	}
	return /** @type {StateModel} */ (value);
}

/** Return whether a config key names one complete npm package (never a subpath or glob). */
export function isExactPackageName(value) {
	if (
		typeof value !== 'string' ||
		value.length === 0 ||
		value.trim() !== value ||
		value.includes('\\') ||
		value.includes('*')
	) {
		return false;
	}
	if (value.startsWith('@')) {
		const slash = value.indexOf('/');
		if (slash <= 1 || slash !== value.lastIndexOf('/') || slash === value.length - 1) {
			return false;
		}
		const scope = value.slice(1, slash);
		const packageName = value.slice(slash + 1);
		return scope !== '.' && scope !== '..' && packageName !== '.' && packageName !== '..';
	}
	return !value.includes('/') && value !== '.' && value !== '..';
}

function stableSignature(value) {
	return `octane-state-model-v${STATE_MODEL_CONFIG_VERSION}:${JSON.stringify(value)}`;
}

/**
 * Validate and canonicalize compiler.stateModel.
 *
 * Package keys are sorted so equivalent configurations share cache identities.
 * The rollout default remains permissive until Octane deliberately flips it.
 *
 * @param {unknown} [input]
 * @returns {ResolvedStateModelConfig}
 */
export function normalizeStateModelConfig(input = {}) {
	if (!isRecord(input)) {
		throw configError('compiler.stateModel must be an object when provided.');
	}
	for (const key of Object.keys(input)) {
		if (!CONFIG_KEYS.has(key)) {
			throw configError(`compiler.stateModel.${key} is not a supported option.`);
		}
	}

	const defaultModel = validateStateModel(
		input.default ?? DEFAULT_STATE_MODEL,
		'compiler.stateModel.default',
	);
	const rawPackages = input.packages ?? {};
	if (!isRecord(rawPackages)) {
		throw configError(
			'compiler.stateModel.packages must be an object keyed by exact dependency package names.',
		);
	}

	const entries = /** @type {[string, StateModel][]} */ (
		Object.entries(rawPackages)
			.map(([name, model]) => {
				if (!isExactPackageName(name)) {
					throw configError(
						`compiler.stateModel.packages key ${JSON.stringify(name)} must be one exact npm package name (for example "widgets" or "@vendor/widgets"), not a subpath or glob.`,
					);
				}
				return [
					name,
					validateStateModel(model, `compiler.stateModel.packages[${JSON.stringify(name)}]`),
				];
			})
			.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
	);
	const packages = Object.freeze(Object.fromEntries(entries));
	const signature = stableSignature({ default: defaultModel, packages });

	return Object.freeze({ default: defaultModel, packages, signature });
}

/**
 * Validate an optional package-authored `octane.stateModel` declaration.
 * @param {unknown} value
 * @param {string | null} [packageName]
 * @returns {StateModel | undefined}
 */
export function normalizePackageStateModel(value, packageName = null) {
	if (value === undefined) return undefined;
	const path =
		typeof packageName === 'string'
			? `${JSON.stringify(packageName)} package.json octane.stateModel`
			: 'package.json octane.stateModel';
	return validateStateModel(value, path);
}
