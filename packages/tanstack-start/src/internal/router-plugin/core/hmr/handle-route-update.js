// Adapted from TanStack/router 6494e75362ff7ca4988ef41046498dea10cbc462.
// Retain the Octane code splitter's explicit skip path for stable route exports.
function handleRouteUpdate(routeId, newRoute, shouldApplyRouteUpdate = true) {
	const router = window.__TSR_ROUTER__;
	const oldRoute = router.routesById[routeId];
	if (!oldRoute) return;
	if (!shouldApplyRouteUpdate) {
		syncHotRouteExport(oldRoute);
		return;
	}
	const generatedRouteOptionKeys = new Set(['id', 'path', 'getParentRoute']);
	const generatedRouteOptions = {};
	generatedRouteOptionKeys.forEach((key) => {
		if (key in oldRoute.options) generatedRouteOptions[key] = oldRoute.options[key];
	});
	const preserveComponentIdentity =
		'shellComponent' in oldRoute.options === 'shellComponent' in newRoute.options;
	const componentKeys = '__TSR_COMPONENT_TYPES__';
	if (preserveComponentIdentity)
		componentKeys.forEach((key) => {
			if (key in oldRoute.options && key in newRoute.options)
				newRoute.options[key] = oldRoute.options[key];
		});
	const nextOptions = {
		...newRoute.options,
		...generatedRouteOptions,
	};
	oldRoute.options = nextOptions;
	oldRoute.update(nextOptions);
	router._replaceRouteChunk(oldRoute, newRoute.lazyFn);
	router.setRoutes(router.buildRouteTree());
	syncHotRouteExport(oldRoute);
	router.resolvePathCache.clear();
	void router._refreshRoute?.();
	function syncHotRouteExport(liveRoute) {
		newRoute.options = liveRoute.options;
		newRoute.parentRoute = liveRoute.parentRoute;
		newRoute._path = liveRoute._path;
		newRoute._id = liveRoute._id;
		newRoute._fullPath = liveRoute._fullPath;
		newRoute._to = liveRoute._to;
	}
}
var handleRouteUpdateStr = handleRouteUpdate.toString();
function getHandleRouteUpdateCode(stableRouteOptionKeys) {
	return handleRouteUpdateStr.replace(
		/['"]__TSR_COMPONENT_TYPES__['"]/,
		JSON.stringify(stableRouteOptionKeys),
	);
}
export { getHandleRouteUpdateCode };
