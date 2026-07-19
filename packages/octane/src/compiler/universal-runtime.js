const UNIVERSAL_RUNTIME_KEYS = new Set(['runtime', 'thread']);
const RUNTIME_ID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

/**
 * Normalize compile-only host-runtime metadata independently from renderer
 * selection. This value is deliberately never stamped onto runtime plan or
 * component records; integrations use it for layer identity, diagnostics,
 * and cache separation.
 */
export function normalizeUniversalRuntime(value, label = 'universalRuntime') {
	if (value === undefined) return undefined;
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`Octane compiler: ${label} must be an object.`);
	}
	for (const key of Object.keys(value)) {
		if (!UNIVERSAL_RUNTIME_KEYS.has(key)) {
			throw new TypeError(`Octane compiler: ${label}.${key} is not a supported option.`);
		}
	}
	if (typeof value.runtime !== 'string' || !RUNTIME_ID.test(value.runtime)) {
		throw new TypeError(
			`Octane compiler: ${label}.runtime must be a lowercase runtime ID (for example "lynx").`,
		);
	}
	if (value.thread !== 'background' && value.thread !== 'main-thread') {
		throw new TypeError(`Octane compiler: ${label}.thread must be "background" or "main-thread".`);
	}
	return Object.freeze({ runtime: value.runtime, thread: value.thread });
}

export function assertUniversalRuntimeTarget(runtime, mode, renderer) {
	if (runtime === undefined) return;
	if (mode !== 'client') {
		throw new TypeError('Octane compiler: universalRuntime is available only in client mode.');
	}
	if (renderer?.target !== 'universal') {
		throw new TypeError(
			'Octane compiler: universalRuntime requires an explicitly selected universal renderer.',
		);
	}
	if (renderer.id !== runtime.runtime) {
		throw new TypeError(
			`Octane compiler: universalRuntime.runtime ${JSON.stringify(runtime.runtime)} does not match renderer ${JSON.stringify(renderer.id)}.`,
		);
	}
}
