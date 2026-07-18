import { inferFullPath } from "@tanstack/router-generator";
//#region src/start-router-plugin/generator-plugins/prerender-routes-plugin.ts
/**
* this plugin gets the prerenderable paths and stores it on globalThis
* so that it can be accessed later (e.g. from a vite plugin)
*/
function prerenderRoutesPlugin() {
	return {
		name: "prerender-routes-plugin",
		onRouteTreeChanged: ({ routeNodes }) => {
			globalThis.TSS_PRERENDABLE_PATHS = getPrerenderablePaths(routeNodes);
		}
	};
}
function getPrerenderablePaths(routeNodes) {
	const paths = new Set(["/"]);
	for (const route of routeNodes) {
		if (!route.routePath) continue;
		if (route.isNonPath === true) continue;
		if (route.routePath.includes("$")) continue;
		if (!route.createFileRouteProps?.has("component")) continue;
		paths.add(inferFullPath(route));
	}
	return Array.from(paths).map((path) => ({ path }));
}
//#endregion
export { prerenderRoutesPlugin };

//# sourceMappingURL=prerender-routes-plugin.js.map