export function readDevtoolsMiddleware<T = unknown>(target: object): T[] {
	const descriptor = Object.getOwnPropertyDescriptor(target, '__SWR_DEVTOOLS_USE__');
	if (!descriptor || !('value' in descriptor) || !Array.isArray(descriptor.value)) return [];
	return descriptor.value.slice() as T[];
}

// OCTANE DIVERGENCE[swr-devtools-global][runtime:c00d484f4ecc81a0]: setupDevTools
// identifies Octane through __SWR_DEVTOOLS_OCTANE__ and does not claim React's
// __SWR_DEVTOOLS_REACT__.
export function setupOctaneDevtools(target: object, runtime: unknown): void {
	Object.defineProperty(target, '__SWR_DEVTOOLS_OCTANE__', {
		configurable: true,
		enumerable: false,
		writable: true,
		value: runtime,
	});
}
