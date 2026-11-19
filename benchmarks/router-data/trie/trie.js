// The octane/router RFC's route matcher (#3001 section 3.2, "match(to): sync,
// compiled trie"), as the Phase 0 reference that Phase 1 lifts into
// packages/octane/src/router/. TanStack Router path syntax:
//
//   /blog          static segment
//   /blog/$slug    required parameter
//   /{-$lang}/help optional parameter
//   /docs/$        splat: the rest of the path, as params._splat
//
// Ranking, at every depth: static > required param > optional param > splat,
// with backtracking, so /blog/new beats /blog/$slug and a dead end under a
// static branch falls back to a parameter branch. An absent optional param is
// left out of params. Matching walks the pathname by index and allocates only
// the segment strings it captures and the params record of a hit.

/**
 * @typedef {{ id: string, path: string }} RouteDef
 * @typedef {{
 *   static: Map<string, TrieNode> | null,
 *   param: TrieNode | null,
 *   paramName: string,
 *   optional: TrieNode | null,
 *   optionalName: string,
 *   splat: RouteLeaf | null,
 *   leaf: RouteLeaf | null,
 * }} TrieNode
 * @typedef {{ id: string, names: readonly string[] }} RouteLeaf
 * @typedef {{ id: string, params: Record<string, string> }} RouteMatch
 */

/** @returns {TrieNode} */
function node() {
	return {
		static: null,
		param: null,
		paramName: '',
		optional: null,
		optionalName: '',
		splat: null,
		leaf: null,
	};
}

/** @param {readonly RouteDef[]} routes */
export function createMatcher(routes) {
	const root = node();
	for (const route of routes) {
		/** @type {string[]} */
		const names = [];
		let n = root;
		const segments = route.path.split('/').filter(Boolean);
		for (let i = 0; i < segments.length; i++) {
			const s = segments[i];
			if (s === '$') {
				if (i !== segments.length - 1) throw new Error(`splat must be last: ${route.path}`);
				names.push('_splat');
				if (n.splat) throw new Error(`duplicate route: ${route.path}`);
				n.splat = { id: route.id, names };
				break;
			}
			if (s.startsWith('{-$') && s.endsWith('}')) {
				const name = s.slice(3, -1);
				if (n.optional && n.optionalName !== name)
					throw new Error(`conflicting optional names at ${route.path}`);
				n.optionalName = name;
				names.push(name);
				n = n.optional ??= node();
			} else if (s.startsWith('$')) {
				const name = s.slice(1);
				if (n.param && n.paramName !== name)
					throw new Error(`conflicting param names at ${route.path}`);
				n.paramName = name;
				names.push(name);
				n = n.param ??= node();
			} else {
				const map = (n.static ??= new Map());
				let next = map.get(s);
				if (!next) map.set(s, (next = node()));
				n = next;
			}
		}
		if (segments.at(-1) === '$') continue;
		if (n.leaf) throw new Error(`duplicate route: ${route.path}`);
		n.leaf = { id: route.id, names };
	}

	/** @type {(string | undefined)[]} */
	const values = [];

	/**
	 * @param {TrieNode} n
	 * @param {string} path
	 * @param {number} at index of the next segment's first character
	 * @param {number} depth captured values so far
	 * @returns {RouteLeaf | null}
	 */
	function walk(n, path, at, depth) {
		while (at < path.length && path.charCodeAt(at) === 47) at++;
		if (at >= path.length) {
			if (n.leaf) return n.leaf;
			// Trailing optionals match empty.
			if (n.optional) {
				values[depth] = undefined;
				const hit = walk(n.optional, path, at, depth + 1);
				if (hit) return hit;
			}
			return null;
		}
		let end = path.indexOf('/', at);
		if (end === -1) end = path.length;
		if (n.static) {
			const next = n.static.get(path.slice(at, end));
			if (next) {
				const hit = walk(next, path, end, depth);
				if (hit) return hit;
			}
		}
		if (n.param) {
			values[depth] = path.slice(at, end);
			const hit = walk(n.param, path, end, depth + 1);
			if (hit) return hit;
		}
		if (n.optional) {
			values[depth] = path.slice(at, end);
			let hit = walk(n.optional, path, end, depth + 1);
			if (hit) return hit;
			values[depth] = undefined;
			hit = walk(n.optional, path, at, depth + 1);
			if (hit) return hit;
		}
		if (n.splat) {
			values[depth] = path.slice(at);
			return n.splat;
		}
		return null;
	}

	/**
	 * @param {string} pathname
	 * @returns {RouteMatch | null}
	 */
	return function match(pathname) {
		const leaf = walk(root, pathname, 0, 0);
		if (!leaf) return null;
		/** @type {Record<string, string>} */
		const params = {};
		for (let i = 0; i < leaf.names.length; i++) {
			const value = values[i];
			// An absent optional param is left out, as in TanStack Router.
			if (value !== undefined)
				params[leaf.names[i]] = value.indexOf('%') === -1 ? value : decodeURIComponent(value);
		}
		return { id: leaf.id, params };
	};
}
