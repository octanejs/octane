const require_runtime = require("../../_virtual/_rolldown/runtime.cjs");
const require_logger = require("../../logger.cjs");
require("./rootPathId.cjs");
const require_utils = require("../../utils.cjs");
const require_loadConfigFile = require("../virtual/loadConfigFile.cjs");
const require_getRouteNodes = require("../virtual/getRouteNodes.cjs");
let node_path = require("node:path");
node_path = require_runtime.__toESM(node_path, 1);
let node_fs_promises = require("node:fs/promises");
node_fs_promises = require_runtime.__toESM(node_fs_promises, 1);
//#region src/filesystem/physical/getRouteNodes.ts
var disallowedRouteGroupConfiguration = /\(([^)]+)\)\.(ts|js|tsx|jsx|vue|tsrx)$/;
var virtualConfigFileRegExp = /__virtual\.[mc]?[jt]s$/;
function isVirtualConfigFile(fileName) {
	return virtualConfigFileRegExp.test(fileName);
}
async function getRouteNodes(config, root, tokenRegexes) {
	const { routeFilePrefix, routeFileIgnorePrefix, routeFileIgnorePattern } = config;
	const logger = require_logger.logging({ disabled: config.disableLogging });
	const routeFileIgnoreRegExp = new RegExp(routeFileIgnorePattern ?? "", "g");
	const routeNodes = [];
	const allPhysicalDirectories = [];
	async function recurse(dir) {
		const fullDir = node_path.default.resolve(config.routesDirectory, dir);
		let dirList = await node_fs_promises.readdir(fullDir, { withFileTypes: true });
		dirList = dirList.filter((d) => {
			if (d.name.startsWith(".") || routeFileIgnorePrefix && d.name.startsWith(routeFileIgnorePrefix)) return false;
			if (routeFilePrefix) {
				if (routeFileIgnorePattern) return d.name.startsWith(routeFilePrefix) && !d.name.match(routeFileIgnoreRegExp);
				return d.name.startsWith(routeFilePrefix);
			}
			if (routeFileIgnorePattern) return !d.name.match(routeFileIgnoreRegExp);
			return true;
		});
		const virtualConfigFile = dirList.find((dirent) => {
			return dirent.isFile() && isVirtualConfigFile(dirent.name);
		});
		if (virtualConfigFile !== void 0) {
			const virtualRouteConfigExport = await require_loadConfigFile.loadConfigFile(node_path.default.resolve(fullDir, virtualConfigFile.name));
			let virtualRouteSubtreeConfig;
			if (typeof virtualRouteConfigExport.default === "function") virtualRouteSubtreeConfig = await virtualRouteConfigExport.default();
			else virtualRouteSubtreeConfig = virtualRouteConfigExport.default;
			const dummyRoot = {
				type: "root",
				file: "",
				children: virtualRouteSubtreeConfig
			};
			const { routeNodes: virtualRouteNodes, physicalDirectories } = await require_getRouteNodes.getRouteNodes({
				...config,
				routesDirectory: fullDir,
				virtualRouteConfig: dummyRoot
			}, root, tokenRegexes);
			allPhysicalDirectories.push(...physicalDirectories);
			virtualRouteNodes.forEach((node) => {
				const normalizedDir = dir === "./" ? "" : dir;
				const filePath = require_utils.replaceBackslash(node_path.default.join(normalizedDir, node.filePath));
				const { routePath: prefixPath, originalRoutePath: originalPrefixPath } = normalizedDir ? require_utils.determineInitialRoutePath(normalizedDir) : {
					routePath: "",
					originalRoutePath: ""
				};
				const routePath = require_utils.cleanPath(`${prefixPath}${node.routePath}`);
				node.variableName = require_utils.routePathToVariable(require_utils.cleanPath(`${prefixPath}/${require_utils.removeExt(node.filePath)}`));
				node._routePathSegmentMetadata = require_utils.joinRoutePathSegmentMetadata(routePath, prefixPath, require_utils.createRoutePathSegmentMetadata(prefixPath, originalPrefixPath), node._routePathSegmentMetadata);
				node.routePath = routePath;
				if (node.originalRoutePath) node.originalRoutePath = require_utils.cleanPath(`${originalPrefixPath}${node.originalRoutePath}`);
				node.filePath = filePath;
				delete node._virtualParentRoutePath;
			});
			routeNodes.push(...virtualRouteNodes);
			return;
		}
		await Promise.all(dirList.map(async (dirent) => {
			const fullPath = require_utils.replaceBackslash(node_path.default.join(fullDir, dirent.name));
			const relativePath = node_path.default.posix.join(dir, dirent.name);
			if (dirent.isDirectory()) await recurse(relativePath);
			else if (fullPath.match(/\.(tsx|ts|jsx|js|vue|tsrx)$/)) {
				const filePath = require_utils.replaceBackslash(node_path.default.join(dir, dirent.name));
				const { routePath: initialRoutePath, originalRoutePath: initialOriginalRoutePath } = require_utils.determineInitialRoutePath(require_utils.removeExt(filePath));
				let routePath = initialRoutePath;
				let originalRoutePath = initialOriginalRoutePath;
				if (routeFilePrefix) {
					routePath = routePath.replaceAll(routeFilePrefix, "");
					originalRoutePath = originalRoutePath.replaceAll(routeFilePrefix, "");
				}
				if (disallowedRouteGroupConfiguration.test(dirent.name)) {
					const errorMessage = `A route configuration for a route group was found at \`${filePath}\`. This is not supported. Did you mean to use a layout/pathless route instead?`;
					logger.error(`ERROR: ${errorMessage}`);
					throw new Error(errorMessage);
				}
				const meta = getRouteMeta(routePath, originalRoutePath, tokenRegexes);
				const variableName = meta.variableName;
				let routeType = meta.fsRouteType;
				if (routeType === "lazy") {
					routePath = routePath.replace(/\/lazy$/, "");
					originalRoutePath = originalRoutePath.replace(/\/lazy$/, "");
				}
				if (isValidPathlessLayoutRoute(routePath, originalRoutePath, routeType, tokenRegexes)) routeType = "pathless_layout";
				if (!filePath.endsWith(".vue")) {
					const extension = node_path.default.extname(filePath);
					[
						["component", "component"],
						["errorComponent", "errorComponent"],
						["notFoundComponent", "notFoundComponent"],
						["pendingComponent", "pendingComponent"],
						["loader", "loader"]
					].forEach(([matcher, type]) => {
						if (routeType === matcher) logger.warn(`WARNING: The \`.${type}${extension}\` suffix used for the ${filePath} file is deprecated. Use the new \`.lazy${extension}\` suffix instead.`);
					});
				}
				const originalSegments = originalRoutePath.split("/").filter(Boolean);
				const lastOriginalSegmentForSuffix = originalSegments[originalSegments.length - 1] || "";
				const { routeTokenSegmentRegex, indexTokenSegmentRegex } = tokenRegexes;
				const specialSuffixes = [
					"component",
					"errorComponent",
					"notFoundComponent",
					"pendingComponent",
					"loader",
					"lazy"
				];
				const routePathSegments = routePath.split("/").filter(Boolean);
				const lastRouteSegment = routePathSegments[routePathSegments.length - 1] || "";
				const suffixToStrip = specialSuffixes.find((suffix) => {
					const endsWithSuffix = routePath.endsWith(`/${suffix}`);
					const isEscaped = lastOriginalSegmentForSuffix.startsWith("[") && lastOriginalSegmentForSuffix.endsWith("]") && require_utils.unwrapBracketWrappedSegment(lastOriginalSegmentForSuffix) === suffix;
					return endsWithSuffix && !isEscaped;
				});
				const routeTokenCandidate = require_utils.unwrapBracketWrappedSegment(lastOriginalSegmentForSuffix);
				const isRouteTokenEscaped = lastOriginalSegmentForSuffix !== routeTokenCandidate && routeTokenSegmentRegex.test(routeTokenCandidate);
				const shouldStripRouteToken = routeTokenSegmentRegex.test(lastRouteSegment) && !isRouteTokenEscaped;
				if (suffixToStrip || shouldStripRouteToken) {
					const stripSegment = suffixToStrip ?? lastRouteSegment;
					routePath = routePath.replace(new RegExp(`/${require_utils.escapeRegExp(stripSegment)}$`), "");
					originalRoutePath = originalRoutePath.replace(new RegExp(`/${require_utils.escapeRegExp(stripSegment)}$`), "");
				}
				const lastOriginalSegment = originalRoutePath.split("/").filter(Boolean).pop() || "";
				const indexTokenCandidate = require_utils.unwrapBracketWrappedSegment(lastOriginalSegment);
				if (!(lastOriginalSegment !== indexTokenCandidate && indexTokenSegmentRegex.test(indexTokenCandidate))) {
					const updatedRouteSegments = routePath.split("/").filter(Boolean);
					const updatedLastRouteSegment = updatedRouteSegments[updatedRouteSegments.length - 1] || "";
					if (indexTokenSegmentRegex.test(updatedLastRouteSegment)) {
						if (routePathSegments.length === 1) routePath = "/";
						const isLayoutRoute = routeType === "layout";
						routePath = routePath.replace(new RegExp(`/${require_utils.escapeRegExp(updatedLastRouteSegment)}$`), "/") || (isLayoutRoute ? "" : "/");
						originalRoutePath = originalRoutePath.replace(new RegExp(`/${require_utils.escapeRegExp(indexTokenCandidate)}$`), "/") || (isLayoutRoute ? "" : "/");
					}
				}
				routeNodes.push({
					filePath,
					fullPath,
					routePath,
					variableName,
					_fsRouteType: routeType,
					originalRoutePath,
					_routePathSegmentMetadata: require_utils.createRoutePathSegmentMetadata(routePath, originalRoutePath)
				});
			}
		}));
		return routeNodes;
	}
	await recurse("./");
	const rootRouteNode = routeNodes.find((d) => d.routePath === `/__root` && ![
		"component",
		"errorComponent",
		"notFoundComponent",
		"pendingComponent",
		"loader",
		"lazy"
	].includes(d._fsRouteType)) ?? routeNodes.find((d) => d.routePath === `/__root`);
	if (rootRouteNode) {
		rootRouteNode._fsRouteType = "__root";
		rootRouteNode.variableName = "root";
	}
	return {
		rootRouteNode,
		routeNodes,
		physicalDirectories: allPhysicalDirectories
	};
}
/**
* Determines the metadata for a given route path based on the provided configuration.
*
* @param routePath - The determined initial routePath (with brackets removed).
* @param originalRoutePath - The original route path (may contain brackets for escaped content).
* @param tokenRegexes - Pre-compiled token regexes for matching.
* @returns An object containing the type of the route and the variable name derived from the route path.
*/
function getRouteMeta(routePath, originalRoutePath, tokenRegexes) {
	let fsRouteType = "static";
	const originalSegments = originalRoutePath.split("/").filter(Boolean);
	const lastOriginalSegment = originalSegments[originalSegments.length - 1] || "";
	const { routeTokenSegmentRegex } = tokenRegexes;
	const isSuffixEscaped = (suffix) => {
		return lastOriginalSegment.startsWith("[") && lastOriginalSegment.endsWith("]") && require_utils.unwrapBracketWrappedSegment(lastOriginalSegment) === suffix;
	};
	const routeSegments = routePath.split("/").filter(Boolean);
	const lastRouteSegment = routeSegments[routeSegments.length - 1] || "";
	const routeTokenCandidate = require_utils.unwrapBracketWrappedSegment(lastOriginalSegment);
	const isRouteTokenEscaped = lastOriginalSegment !== routeTokenCandidate && routeTokenSegmentRegex.test(routeTokenCandidate);
	if (routeTokenSegmentRegex.test(lastRouteSegment) && !isRouteTokenEscaped) fsRouteType = "layout";
	else if (routePath.endsWith("/lazy") && !isSuffixEscaped("lazy")) fsRouteType = "lazy";
	else if (routePath.endsWith("/loader") && !isSuffixEscaped("loader")) fsRouteType = "loader";
	else if (routePath.endsWith("/component") && !isSuffixEscaped("component")) fsRouteType = "component";
	else if (routePath.endsWith("/pendingComponent") && !isSuffixEscaped("pendingComponent")) fsRouteType = "pendingComponent";
	else if (routePath.endsWith("/errorComponent") && !isSuffixEscaped("errorComponent")) fsRouteType = "errorComponent";
	else if (routePath.endsWith("/notFoundComponent") && !isSuffixEscaped("notFoundComponent")) fsRouteType = "notFoundComponent";
	const variableName = require_utils.routePathToVariable(originalSegments.some((seg) => seg.startsWith("[") && seg.endsWith("]") && !seg.slice(1, -1).includes("[") && !seg.slice(1, -1).includes("]")) ? originalRoutePath : routePath);
	return {
		fsRouteType,
		variableName
	};
}
/**
* Used to validate if a route is a pathless layout route
* @param normalizedRoutePath Normalized route path, i.e `/foo/_layout/route.tsx` and `/foo._layout.route.tsx` to `/foo/_layout/route`
* @param originalRoutePath Original route path with brackets for escaped content
* @param routeType The route type determined from file extension
* @param tokenRegexes Pre-compiled token regexes for matching
* @returns Boolean indicating if the route is a pathless layout route
*/
function isValidPathlessLayoutRoute(normalizedRoutePath, originalRoutePath, routeType, tokenRegexes) {
	if (routeType === "lazy") return false;
	const segments = normalizedRoutePath.split("/").filter(Boolean);
	const originalSegments = originalRoutePath.split("/").filter(Boolean);
	if (segments.length === 0) return false;
	const lastRouteSegment = segments[segments.length - 1];
	const lastOriginalSegment = originalSegments[originalSegments.length - 1] || "";
	const secondToLastRouteSegment = segments[segments.length - 2];
	const secondToLastOriginalSegment = originalSegments[originalSegments.length - 2];
	if (lastRouteSegment === "__root") return false;
	const { routeTokenSegmentRegex, indexTokenSegmentRegex } = tokenRegexes;
	if (routeTokenSegmentRegex.test(lastRouteSegment) && typeof secondToLastRouteSegment === "string" && typeof secondToLastOriginalSegment === "string") {
		if (require_utils.hasEscapedLeadingUnderscore(secondToLastOriginalSegment)) return false;
		return secondToLastRouteSegment.startsWith("_");
	}
	if (require_utils.hasEscapedLeadingUnderscore(lastOriginalSegment)) return false;
	return !indexTokenSegmentRegex.test(lastRouteSegment) && !routeTokenSegmentRegex.test(lastRouteSegment) && lastRouteSegment.startsWith("_");
}
//#endregion
exports.getRouteNodes = getRouteNodes;
exports.isVirtualConfigFile = isVirtualConfigFile;

//# sourceMappingURL=getRouteNodes.cjs.map