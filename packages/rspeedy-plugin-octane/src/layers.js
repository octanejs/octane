export const LYNX_BACKGROUND_LAYER = 'octane:background';
export const LYNX_MAIN_THREAD_LAYER = 'octane:main-thread';

export const LYNX_BACKGROUND_RUNTIME = Object.freeze({
	runtime: 'lynx',
	thread: 'background',
});

export const LYNX_MAIN_THREAD_RUNTIME = Object.freeze({
	runtime: 'lynx',
	thread: 'main-thread',
});

export function resolveLynxLayer(thread) {
	if (thread === 'background') {
		return {
			layer: LYNX_BACKGROUND_LAYER,
			universalRuntime: LYNX_BACKGROUND_RUNTIME,
		};
	}
	if (thread === 'main-thread') {
		return {
			layer: LYNX_MAIN_THREAD_LAYER,
			universalRuntime: LYNX_MAIN_THREAD_RUNTIME,
		};
	}
	throw new TypeError(
		`@octanejs/rspeedy-plugin: \`thread\` must be "background" or "main-thread" (received ${JSON.stringify(thread)}).`,
	);
}

function layeredEntryValue(value, layer) {
	if (typeof value === 'string') return { import: [value], layer };
	if (Array.isArray(value)) return { import: value, layer };
	if (value === null || typeof value !== 'object') {
		throw new TypeError('@octanejs/rspeedy-plugin: Rspeedy produced an invalid entry value.');
	}
	if (value.layer !== undefined && value.layer !== layer) {
		throw new Error(
			`@octanejs/rspeedy-plugin: entry layer ${JSON.stringify(value.layer)} conflicts with ${JSON.stringify(layer)}.`,
		);
	}
	return { ...value, layer };
}

/** Stamp every current Rspeedy entry with the selected Octane thread layer. */
export function applyLynxEntryLayer(chain, layer) {
	const entries = Object.entries(chain.entryPoints.entries() ?? {}).map(([name, entryPoint]) => [
		name,
		[...entryPoint.values()],
	]);
	chain.entryPoints.clear();
	for (const [name, values] of entries) {
		for (const value of values) {
			chain.entry(name).add(layeredEntryValue(value, layer));
		}
	}
}
