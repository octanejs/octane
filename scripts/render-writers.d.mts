/** Every runtime function that writes the DOM, by when it may (check-render-writes.mjs). */
export const WRITERS: Map<
	string,
	'commit' | 'primitive' | 'fresh' | 'hydration' | 'unmount' | 'native' | 'hint'
>;
/** 'fresh' writers that reach derived DOM without testing for a frontier, with why. */
export const UNGUARDED_FRESH: Map<string, string>;
