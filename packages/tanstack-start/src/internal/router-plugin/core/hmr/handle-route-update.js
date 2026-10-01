//#region src/core/hmr/handle-route-update.ts
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
	const removedKeys = /* @__PURE__ */ new Set();
	Object.keys(oldRoute.options).forEach((key) => {
		if (!generatedRouteOptionKeys.has(key) && !(key in newRoute.options)) {
			removedKeys.add(key);
			delete oldRoute.options[key];
		}
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
	oldRoute._componentsPromise = void 0;
	oldRoute._lazyPromise = void 0;
	router.setRoutes(router.buildRouteTree());
	syncHotRouteExport(oldRoute);
	router.resolvePathCache.clear();
	const filter = (m) => m.routeId === oldRoute.id;
	// router-core 1.171.34 keys stores by routeId (`byRoute`/`getMatchStore`) and
	// dropped the pending/cached match pools, so HMR patches the active match only;
	// a full reload still covers pending/cached matches.
	const activeMatch = router.stores.matches.get().find(filter);
	if (activeMatch) {
		if (removedKeys.has('loader') || removedKeys.has('beforeLoad')) {
			router.batch(() => {
				const store = router.stores.getMatchStore(activeMatch.routeId);
				if (store)
					store.set((prev) => {
						const next = { ...prev };
						if (removedKeys.has('loader')) next.loaderData = void 0;
						if (removedKeys.has('beforeLoad')) {
							next.__beforeLoadContext = void 0;
							next.context = rebuildMatchContextWithoutBeforeLoad(next);
						}
						return next;
					});
			});
		}
		router.invalidate({
			filter,
			sync: true,
		});
	}
	function syncHotRouteExport(liveRoute) {
		newRoute.options = liveRoute.options;
		newRoute.parentRoute = liveRoute.parentRoute;
		newRoute._path = liveRoute._path;
		newRoute._id = liveRoute._id;
		newRoute._fullPath = liveRoute._fullPath;
		newRoute._to = liveRoute._to;
	}
	function getStoreMatch(routeId) {
		return router.stores.getMatchStore(routeId)?.get();
	}
	function getParentMatch(match) {
		const matches = router.stores.matches.get();
		const matchIndex = matches.findIndex((item) => item.routeId === match.routeId);
		if (matchIndex <= 0) return;
		const parentMatch = matches[matchIndex - 1];
		return getStoreMatch(parentMatch.routeId) || parentMatch;
	}
	function rebuildMatchContextWithoutBeforeLoad(match) {
		const parentMatch = getParentMatch(match);
		const getParentContext = router.getParentContext;
		return {
			...((getParentContext
				? getParentContext.call(router, parentMatch)
				: (parentMatch?.context ?? router.options.context)) ?? {}),
			...(match.__routeContext ?? {}),
		};
	}
}
var handleRouteUpdateStr = handleRouteUpdate.toString();
function getHandleRouteUpdateCode(stableRouteOptionKeys) {
	return handleRouteUpdateStr.replace(
		/['"]__TSR_COMPONENT_TYPES__['"]/,
		JSON.stringify(stableRouteOptionKeys),
	);
}
//#endregion
export { getHandleRouteUpdateCode };
