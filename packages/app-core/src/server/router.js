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
		.map((segment) => {
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
 * Escape special regex characters
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Create a router from a list of routes
 * @param {Route[]} routes
 * @returns {{ match: (method: string, pathname: string) => RouteMatch | null }}
 */
export function createRouter(routes) {
	/** @type {CompiledRoute[]} */
	const compiledRoutes = routes.map((route) => {
		const { pattern, paramNames, specificity } = compilePath(route.path);
		return { route, pattern, paramNames, specificity };
	});

	// Sort by specificity (higher first) for correct matching order
	compiledRoutes.sort((a, b) => b.specificity - a.specificity);

	// Exact static paths are O(1). A static segment always out-scores a param or
	// catch-all that could match the same pathname, so the map is consulted first.
	// After a method miss, fall through to dynamic routes — a catch-all can still
	// own the request.
	/** @type {Map<string, CompiledRoute[]>} */
	const staticByPath = new Map();
	/** @type {CompiledRoute[]} */
	const dynamicRoutes = [];
	for (let i = 0; i < compiledRoutes.length; i++) {
		const compiled = compiledRoutes[i];
		if (typeof compiled.pattern === 'string') {
			const existing = staticByPath.get(compiled.pattern);
			if (existing === undefined) staticByPath.set(compiled.pattern, [compiled]);
			else existing.push(compiled);
		} else {
			dynamicRoutes.push(compiled);
		}
	}

	return {
		/**
		 * Match a request to a route
		 * @param {string} method
		 * @param {string} pathname
		 * @returns {RouteMatch | null}
		 */
		match(method, pathname) {
			const staticMatches = staticByPath.get(pathname);
			if (staticMatches !== undefined) {
				let normalizedMethod;
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

			let normalizedMethod;
			for (let i = 0; i < dynamicRoutes.length; i++) {
				const compiled = dynamicRoutes[i];
				const route = compiled.route;
				if (route.type === 'server') {
					const methods = /** @type {ServerRoute} */ (route).methods;
					if (normalizedMethod === undefined) normalizedMethod = method.toUpperCase();
					if (!methods.includes(normalizedMethod)) continue;
				}

				const pattern = compiled.pattern;
				if (typeof pattern === 'string') continue;
				const match = pattern.exec(pathname);
				if (match === null) continue;
				const paramNames = compiled.paramNames;
				/** @type {Record<string, string>} */
				const params = {};
				for (let p = 0; p < paramNames.length; p++) {
					params[paramNames[p]] = decodeURIComponent(match[p + 1]);
				}
				return { route, params };
			}
			return null;
		},
	};
}
