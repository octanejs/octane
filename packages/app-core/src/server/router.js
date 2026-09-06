// @ts-check
/**
 * @typedef {import('@octanejs/app-core').Route} Route
 * @typedef {import('@octanejs/app-core').RenderRoute} RenderRoute
 * @typedef {import('@octanejs/app-core').ServerRoute} ServerRoute
 */

/**
 * @typedef {Object} RouteMatch
 * @property {Route} route
 * @property {Record<string, string>} params
 */

/**
 * @typedef {Object} CompiledRoute
 * @property {Route} route
 * @property {string | RegExp} pattern
 * @property {string[]} paramNames
 * @property {number} specificity - Higher = more specific (static > param > catch-all)
 * @property {number} order - Specificity-desc index; breaks equal-spec ties
 */

/**
 * Compile a route path into an exact string or capturing RegExp
 * Supports:
 * - Static segments: /about, /api/hello
 * - Named params: /posts/:id, /users/:userId/posts/:postId
 * - Catch-all: /docs/*slug
 *
 * @param {string} path
 * @returns {{ pattern: string | RegExp, paramNames: string[], specificity: number }}
 */
function compilePath(path) {
	/** @type {string[]} */
	const paramNames = [];
	let specificity = 0;

	// Escape special regex characters except our param syntax
	const regexString = path
		.split('/')
		.map(function (segment) {
			if (!segment) return '';

			// Catch-all param: *slug
			if (segment.startsWith('*')) {
				const paramName = segment.slice(1);
				paramNames.push(paramName);
				specificity += 1; // Lowest specificity
				return '(.+)';
			}

			// Named param: :id
			if (segment.startsWith(':')) {
				const paramName = segment.slice(1);
				paramNames.push(paramName);
				specificity += 10; // Medium specificity
				return '([^/]+)';
			}

			// Static segment
			specificity += 100; // Highest specificity
			return escapeRegex(segment);
		})
		.join('/');

	// Static paths are already exact matchers. Keep RegExp capture work for the
	// parameter and catch-all routes that need it.
	const pattern = paramNames.length === 0 ? path || '/' : new RegExp(`^${regexString || '/'}$`);
	return { pattern, paramNames, specificity };
}

/**
 * Last static segment of a dynamic route pattern. Positions skip empty
 * segments so they line up with a leading-slash pathname split.
 * A static token after a catch-all is not at a fixed index (`(.+)` can
 * consume several segments), so those patterns stay on the linear remainder.
 *
 * @param {string} path
 * @returns {{ pos: number, value: string } | null}
 */
function lastStaticSegment(path) {
	const raw = path.split('/');
	let pos = -1;
	let value = '';
	let index = 0;
	let sawCatchAll = false;
	for (let i = 0; i < raw.length; i++) {
		const segment = raw[i];
		if (!segment) continue;
		const first = segment.charCodeAt(0);
		if (first === 42 /* * */) {
			sawCatchAll = true;
		} else if (first !== 58 /* : */) {
			if (sawCatchAll) return null;
			pos = index;
			value = segment;
		}
		index++;
	}
	if (pos === -1) return null;
	return { pos, value };
}

/**
 * Non-empty pathname segments, matching lastStaticSegment positions.
 *
 * @param {string} pathname
 * @returns {string[]}
 */
function pathnameSegments(pathname) {
	const raw = pathname.split('/');
	const parts = [];
	for (let i = 0; i < raw.length; i++) {
		if (raw[i]) parts.push(raw[i]);
	}
	return parts;
}

/**
 * Escape special regex characters
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {CompiledRoute} compiled
 * @param {string} method
 * @param {string} pathname
 * @param {string | undefined} normalizedMethod
 * @returns {RouteMatch | null}
 */
function matchCompiled(compiled, method, pathname, normalizedMethod) {
	const route = compiled.route;
	if (route.type === 'server') {
		const methods = /** @type {ServerRoute} */ (route).methods;
		if (normalizedMethod === undefined) normalizedMethod = method.toUpperCase();
		if (!methods.includes(normalizedMethod)) return null;
	}

	const match = /** @type {RegExp} */ (compiled.pattern).exec(pathname);
	if (match === null) return null;
	const paramNames = compiled.paramNames;
	/** @type {Record<string, string>} */
	const params = {};
	for (let p = 0; p < paramNames.length; p++) {
		params[paramNames[p]] = decodeURIComponent(match[p + 1]);
	}
	return { route, params };
}

/**
 * Create a router from a list of routes
 * @param {Route[]} routes
 * @returns {{ match: (method: string, pathname: string) => RouteMatch | null }}
 */
export function createRouter(routes) {
	/** @type {CompiledRoute[]} */
	const compiledRoutes = [];
	for (let i = 0; i < routes.length; i++) {
		const route = routes[i];
		const compiled = compilePath(route.path);
		compiledRoutes.push({
			route,
			pattern: compiled.pattern,
			paramNames: compiled.paramNames,
			specificity: compiled.specificity,
			order: i,
		});
	}

	// Sort by specificity (higher first) for correct matching order
	compiledRoutes.sort(function (a, b) {
		if (b.specificity !== a.specificity) return b.specificity - a.specificity;
		return a.order - b.order;
	});
	for (let i = 0; i < compiledRoutes.length; i++) {
		compiledRoutes[i].order = i;
	}

	// Exact static paths are O(1). A matching static always out-scores a param
	// or catch-all that could match the same pathname, so the map is consulted
	// first. After a method miss, matching falls through to the dynamic index.
	/** @type {Map<string, CompiledRoute[]>} */
	const staticByPath = new Map();
	/** @type {Array<Map<string, CompiledRoute[]> | undefined>} */
	const dynamicByPos = [];
	/** @type {CompiledRoute[]} */
	const dynamicNoStatic = [];

	for (let i = 0; i < compiledRoutes.length; i++) {
		const compiled = compiledRoutes[i];
		if (typeof compiled.pattern === 'string') {
			const existing = staticByPath.get(compiled.pattern);
			if (existing === undefined) staticByPath.set(compiled.pattern, [compiled]);
			else existing.push(compiled);
			continue;
		}
		const last = lastStaticSegment(compiled.route.path);
		if (last === null) {
			dynamicNoStatic.push(compiled);
			continue;
		}
		let bucketMap = dynamicByPos[last.pos];
		if (bucketMap === undefined) {
			bucketMap = new Map();
			dynamicByPos[last.pos] = bucketMap;
		}
		const existing = bucketMap.get(last.value);
		if (existing === undefined) bucketMap.set(last.value, [compiled]);
		else existing.push(compiled);
	}

	return {
		/**
		 * Match a request to a route
		 * @param {string} method
		 * @param {string} pathname
		 * @returns {RouteMatch | null}
		 */
		match: function (method, pathname) {
			let normalizedMethod;
			const staticMatches = staticByPath.get(pathname);
			if (staticMatches !== undefined) {
				for (let i = 0; i < staticMatches.length; i++) {
					const route = staticMatches[i].route;
					if (route.type === 'server') {
						const methods = /** @type {ServerRoute} */ (route).methods;
						if (normalizedMethod === undefined) normalizedMethod = method.toUpperCase();
						if (!methods.includes(normalizedMethod)) continue;
					}
					return { route, params: {} };
				}
			}

			const parts = pathnameSegments(pathname);
			/** @type {CompiledRoute | null} */
			let first = null;
			/** @type {CompiledRoute[] | null} */
			let extra = null;
			for (let p = 0; p < parts.length; p++) {
				const bucketMap = dynamicByPos[p];
				if (bucketMap === undefined) continue;
				const bucket = bucketMap.get(parts[p]);
				if (bucket === undefined) continue;
				for (let b = 0; b < bucket.length; b++) {
					if (first === null) first = bucket[b];
					else if (extra === null) extra = [bucket[b]];
					else extra.push(bucket[b]);
				}
			}
			for (let r = 0; r < dynamicNoStatic.length; r++) {
				if (first === null) first = dynamicNoStatic[r];
				else if (extra === null) extra = [dynamicNoStatic[r]];
				else extra.push(dynamicNoStatic[r]);
			}

			if (first === null) return null;
			if (extra === null) return matchCompiled(first, method, pathname, normalizedMethod);

			const candidates = extra;
			candidates.push(first);
			candidates.sort(function (a, b) {
				return a.order - b.order;
			});
			for (let c = 0; c < candidates.length; c++) {
				const hit = matchCompiled(candidates[c], method, pathname, normalizedMethod);
				if (hit !== null) return hit;
				if (candidates[c].route.type === 'server' && normalizedMethod === undefined) {
					normalizedMethod = method.toUpperCase();
				}
			}
			return null;
		},
	};
}
