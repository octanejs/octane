const require_runtime = require("../../_virtual/_rolldown/runtime.cjs");
const require_config = require("./config.cjs");
const require_rootPathId = require("../physical/rootPathId.cjs");
const require_utils = require("../../utils.cjs");
const require_loadConfigFile = require("./loadConfigFile.cjs");
const require_getRouteNodes = require("../physical/getRouteNodes.cjs");
let node_path = require("node:path");
node_path = require_runtime.__toESM(node_path, 1);
//#region src/filesystem/virtual/getRouteNodes.ts
function ensureLeadingUnderScore(id) {
	if (id.startsWith("_")) return id;
	return `_${id}`;
}
function flattenTree(node) {
	const result = [node];
	if (node.children) for (const child of node.children) result.push(...flattenTree(child));
	delete node.children;
	return result;
}
async function getRouteNodes(tsrConfig, root, tokenRegexes) {
	const fullDir = (0, node_path.resolve)(tsrConfig.routesDirectory);
	if (tsrConfig.virtualRouteConfig === void 0) throw new Error(`virtualRouteConfig is undefined`);
	let virtualRouteConfig;
	if (typeof tsrConfig.virtualRouteConfig === "string") virtualRouteConfig = await getVirtualRouteConfigFromFileExport(tsrConfig, root);
	else virtualRouteConfig = tsrConfig.virtualRouteConfig;
	const { children, physicalDirectories } = await getRouteNodesRecursive(tsrConfig, root, fullDir, virtualRouteConfig.children, tokenRegexes);
	const allNodes = flattenTree({
		children,
		filePath: virtualRouteConfig.file,
		fullPath: require_utils.replaceBackslash((0, node_path.join)(fullDir, virtualRouteConfig.file)),
		variableName: "root",
		routePath: `/${require_rootPathId.rootPathId}`,
		_fsRouteType: "__root"
	});
	return {
		rootRouteNode: allNodes[0],
		routeNodes: allNodes.slice(1),
		physicalDirectories
	};
}
/**
* Get the virtual route config from a file export
*
* @example
* ```ts
* // routes.ts
* import { rootRoute } from '@tanstack/virtual-file-routes'
*
* export const routes = rootRoute({ ... })
* // or
* export default rootRoute({ ... })
* ```
*
*/
async function getVirtualRouteConfigFromFileExport(tsrConfig, root) {
	if (tsrConfig.virtualRouteConfig === void 0 || typeof tsrConfig.virtualRouteConfig !== "string" || tsrConfig.virtualRouteConfig === "") throw new Error(`virtualRouteConfig is undefined or empty`);
	const exports = await require_loadConfigFile.loadConfigFile((0, node_path.join)(root, tsrConfig.virtualRouteConfig));
	if (!("routes" in exports) && !("default" in exports)) throw new Error(`routes not found in ${tsrConfig.virtualRouteConfig}. The routes export must be named like 'export const routes = ...' or done using 'export default ...'`);
	const virtualRouteConfig = "routes" in exports ? exports.routes : exports.default;
	return require_config.virtualRootRouteSchema.parse(virtualRouteConfig);
}
async function getRouteNodesRecursive(tsrConfig, root, fullDir, nodes, tokenRegexes, parent) {
	if (nodes === void 0) return {
		children: [],
		physicalDirectories: []
	};
	const allPhysicalDirectories = [];
	return {
		children: (await Promise.all(nodes.map(async (node) => {
			if (node.type === "physical") {
				const { routePath: routePathPrefix, originalRoutePath: originalRoutePathPrefix } = node.pathPrefix ? require_utils.determineInitialRoutePathFromExplicitPath(require_utils.removeLeadingSlash(node.pathPrefix)) : {
					routePath: "",
					originalRoutePath: ""
				};
				const { routeNodes, physicalDirectories } = await require_getRouteNodes.getRouteNodes({
					...tsrConfig,
					routesDirectory: (0, node_path.resolve)(fullDir, node.directory)
				}, root, tokenRegexes);
				allPhysicalDirectories.push((0, node_path.resolve)(fullDir, node.directory), ...physicalDirectories);
				routeNodes.forEach((subtreeNode) => {
					const pathPrefix = require_utils.cleanPath(`${parent?.routePath ?? ""}${routePathPrefix}`);
					const originalPathPrefix = require_utils.cleanPath(`${parent?.originalRoutePath ?? parent?.routePath ?? ""}${originalRoutePathPrefix}`);
					const literalPathPrefixSegments = require_utils.createLiteralRoutePathSegmentMetadata(pathPrefix, parent, true);
					const routePath = require_utils.cleanPath(`${pathPrefix}${subtreeNode.routePath}`);
					subtreeNode.variableName = require_utils.routePathToVariable(`${routePathPrefix}/${require_utils.removeExt(subtreeNode.filePath)}`);
					subtreeNode._routePathSegmentMetadata = require_utils.joinRoutePathSegmentMetadata(routePath, pathPrefix, literalPathPrefixSegments, subtreeNode._routePathSegmentMetadata);
					subtreeNode.routePath = routePath;
					if (subtreeNode.originalRoutePath) subtreeNode.originalRoutePath = require_utils.cleanPath(`${originalPathPrefix}${subtreeNode.originalRoutePath}`);
					subtreeNode.filePath = `${node.directory}/${subtreeNode.filePath}`;
				});
				return routeNodes;
			}
			function getFile(file) {
				const filePath = file;
				return {
					filePath,
					variableName: require_utils.routePathToVariable(require_utils.removeExt(filePath)),
					fullPath: require_utils.replaceBackslash((0, node_path.join)(fullDir, filePath))
				};
			}
			const parentRoutePath = require_utils.removeTrailingSlash(parent?.routePath ?? "/");
			const parentOriginalRoutePath = require_utils.removeTrailingSlash(parent?.originalRoutePath ?? parent?.routePath ?? "/");
			const virtualParentRoutePath = parent?.routePath ?? `/__root`;
			switch (node.type) {
				case "index": {
					const { filePath, variableName, fullPath } = getFile(node.file);
					return {
						filePath,
						fullPath,
						variableName,
						routePath: `${parentRoutePath}/`,
						originalRoutePath: `${parentOriginalRoutePath}/`,
						_routePathSegmentMetadata: parent?._routePathSegmentMetadata ? [...parent._routePathSegmentMetadata] : void 0,
						_fsRouteType: "static",
						_virtualParentRoutePath: virtualParentRoutePath
					};
				}
				case "route": {
					const lastSegment = node.path;
					let routeNode;
					const { routePath: escapedSegment, originalRoutePath: originalSegment } = require_utils.determineInitialRoutePathFromExplicitPath(require_utils.removeLeadingSlash(lastSegment));
					const routePath = `${parentRoutePath}${escapedSegment}`;
					const originalRoutePath = `${parentOriginalRoutePath}${originalSegment}`;
					const routePathSegmentMetadata = require_utils.createLiteralRoutePathSegmentMetadata(routePath, parent, true);
					if (node.file) {
						const { filePath, variableName, fullPath } = getFile(node.file);
						routeNode = {
							filePath,
							fullPath,
							variableName,
							routePath,
							originalRoutePath,
							_routePathSegmentMetadata: routePathSegmentMetadata,
							_fsRouteType: "static",
							_virtualParentRoutePath: virtualParentRoutePath
						};
					} else routeNode = {
						filePath: "",
						fullPath: "",
						variableName: require_utils.routePathToVariable(routePath),
						routePath,
						originalRoutePath,
						_routePathSegmentMetadata: routePathSegmentMetadata,
						isVirtual: true,
						_fsRouteType: "static",
						_virtualParentRoutePath: virtualParentRoutePath
					};
					if (node.children !== void 0) {
						const { children, physicalDirectories } = await getRouteNodesRecursive(tsrConfig, root, fullDir, node.children, tokenRegexes, routeNode);
						routeNode.children = children;
						allPhysicalDirectories.push(...physicalDirectories);
						routeNode._fsRouteType = "layout";
					}
					return routeNode;
				}
				case "layout": {
					const { filePath, variableName, fullPath } = getFile(node.file);
					if (node.id !== void 0) node.id = ensureLeadingUnderScore(node.id);
					else {
						const baseName = node_path.default.basename(filePath);
						const fileNameWithoutExt = node_path.default.parse(baseName).name;
						node.id = ensureLeadingUnderScore(fileNameWithoutExt);
					}
					const lastSegment = node.id;
					const { routePath: escapedSegment, originalRoutePath: originalSegment } = require_utils.determineInitialRoutePathFromExplicitPath(require_utils.removeLeadingSlash(lastSegment));
					const routePath = `${parentRoutePath}${escapedSegment}`;
					const routeNode = {
						fullPath,
						filePath,
						variableName,
						routePath,
						originalRoutePath: `${parentOriginalRoutePath}${originalSegment}`,
						_routePathSegmentMetadata: require_utils.joinRoutePathSegmentMetadata(routePath, parentRoutePath, parent?._routePathSegmentMetadata, require_utils.createRoutePathSegmentMetadata(escapedSegment, originalSegment)),
						_fsRouteType: "pathless_layout",
						_virtualParentRoutePath: virtualParentRoutePath
					};
					if (node.children !== void 0) {
						const { children, physicalDirectories } = await getRouteNodesRecursive(tsrConfig, root, fullDir, node.children, tokenRegexes, routeNode);
						routeNode.children = children;
						allPhysicalDirectories.push(...physicalDirectories);
					}
					return routeNode;
				}
			}
		}))).flat(),
		physicalDirectories: allPhysicalDirectories
	};
}
//#endregion
exports.getRouteNodes = getRouteNodes;

//# sourceMappingURL=getRouteNodes.cjs.map