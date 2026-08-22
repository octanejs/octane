import * as React from 'octane';
const fallbackSite = Symbol('apollo.__use');
// Apollo's React adapter falls back to throwing decorated promises on React 18.
// Octane always has use(), so the adapter uses it directly. The public hook's
// compiler-provided site is threaded through on the server so conditional
// sibling hooks keep stable SSR cache identities.
export function __use(promise, site) {
	return React.use(promise, site ?? fallbackSite);
}
