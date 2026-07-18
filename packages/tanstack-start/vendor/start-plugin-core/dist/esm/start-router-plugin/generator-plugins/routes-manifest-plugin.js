import { rootRouteId } from "@tanstack/router-core";
//#region src/start-router-plugin/generator-plugins/routes-manifest-plugin.ts
/**
* this plugin builds the routes manifest and stores it on globalThis
* so that it can be accessed later (e.g. from a vite plugin)
*/
function routesManifestPlugin() {
	return {
		name: "routes-manifest-plugin",
		onRouteTreeChanged: ({ routeTree, rootRouteNode, routeNodes }) => {
			const allChildren = routeTree.map((d) => d.routePath);
			const routes = {
				[rootRouteId]: {
					filePath: rootRouteNode.fullPath,
					children: allChildren
				},
				...Object.fromEntries(routeNodes.map((d) => {
					return [d.routePath, {
						filePath: d.fullPath,
						children: d.children?.map((childRoute) => childRoute.routePath)
					}];
				}))
			};
			globalThis.TSS_ROUTES_MANIFEST = routes;
		}
	};
}
//#endregion
export { routesManifestPlugin };

//# sourceMappingURL=routes-manifest-plugin.js.map