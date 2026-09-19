// @ts-check

/**
 * Serialize the common dev/production hydration payload in a stable order.
 * Build and document identities are supplied by the caller, never generated or
 * cached here. Escape HTML delimiters before embedding JSON in an inline script.
 * @param {import('@octanejs/app-core/html').RouteHydrationData} data
 * @returns {string}
 */
export function serializeRouteData(data) {
	return JSON.stringify({
		entry: data.entry,
		exportName: data.exportName ?? null,
		layout: data.layout ?? null,
		routeIndex: data.routeIndex,
		params: data.params,
		url: data.url,
		preHydrate: data.preHydrate ?? null,
		rootBoundary: data.rootBoundary ?? { pending: null, catch: null },
		clientBuild: data.clientBuild,
		streamedSignals: data.streamedSignals,
	})
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e');
}
