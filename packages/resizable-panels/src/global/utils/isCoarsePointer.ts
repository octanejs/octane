let cached: boolean | undefined;

/** Caches the current primary-pointer precision without reading browser globals during SSR. */
export function isCoarsePointer(): boolean {
	if (cached === undefined)
		cached = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;
	return cached;
}
