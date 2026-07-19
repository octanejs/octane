const require_runtime = require("./_virtual/_rolldown/runtime.cjs");
require("./filesystem/physical/rootPathId.cjs");
let node_path = require("node:path");
node_path = require_runtime.__toESM(node_path, 1);
let node_fs_promises = require("node:fs/promises");
node_fs_promises = require_runtime.__toESM(node_fs_promises, 1);
let prettier = require("prettier");
prettier = require_runtime.__toESM(prettier, 1);
//#region src/utils.ts
/**
* Prefix map for O(1) parent route lookups.
* Maps each route path prefix to the route node that owns that prefix.
* Enables finding longest matching parent without linear search.
*/
var RoutePrefixMap = class {
	constructor(routes) {
		this.prefixToRoute = /* @__PURE__ */ new Map();
		for (const route of routes) {
			if (!route.routePath || route.routePath === `/__root`) continue;
			if (route._fsRouteType === "lazy" || route._fsRouteType === "loader" || route._fsRouteType === "component" || route._fsRouteType === "pendingComponent" || route._fsRouteType === "errorComponent" || route._fsRouteType === "notFoundComponent") continue;
			this.prefixToRoute.set(route.routePath, route);
		}
	}
	/**
	* Find the longest matching parent route for a given path.
	* O(k) where k is the number of path segments, not O(n) routes.
	*/
	findParent(routePath) {
		if (!routePath || routePath === "/") return null;
		let searchPath = routePath;
		while (searchPath.length > 0) {
			const lastSlash = searchPath.lastIndexOf("/");
			if (lastSlash <= 0) break;
			searchPath = searchPath.substring(0, lastSlash);
			const parent = this.prefixToRoute.get(searchPath);
			if (parent && parent.routePath !== routePath) return parent;
		}
		return null;
	}
	/**
	* Check if a route exists at the given path.
	*/
	has(routePath) {
		return this.prefixToRoute.has(routePath);
	}
	/**
	* Get a route by exact path.
	*/
	get(routePath) {
		return this.prefixToRoute.get(routePath);
	}
};
function multiSortBy(arr, accessors = [(d) => d]) {
	const len = arr.length;
	const indexed = new Array(len);
	for (let i = 0; i < len; i++) {
		const item = arr[i];
		const keys = new Array(accessors.length);
		for (let j = 0; j < accessors.length; j++) keys[j] = accessors[j](item);
		indexed[i] = {
			item,
			index: i,
			keys
		};
	}
	indexed.sort((a, b) => {
		for (let j = 0; j < accessors.length; j++) {
			const ao = a.keys[j];
			const bo = b.keys[j];
			if (typeof ao === "undefined") {
				if (typeof bo === "undefined") continue;
				return 1;
			}
			if (ao === bo) continue;
			return ao > bo ? 1 : -1;
		}
		return a.index - b.index;
	});
	const result = new Array(len);
	for (let i = 0; i < len; i++) result[i] = indexed[i].item;
	return result;
}
/**
* Sorts route nodes by root, path depth, index status, and finally `routePath`.
* The `routePath` comparison keeps the output consistent when the earlier
* values are the same.
*/
function sortRouteNodes(routeNodes, indexTokenSegmentRegex) {
	return multiSortBy(routeNodes, [
		(d) => d.routePath?.includes(`/__root`) ? -1 : 1,
		(d) => d.routePath === void 0 ? void 0 : countSlashSeparatedParts(d.routePath),
		(d) => {
			const segments = d.routePath?.split("/").filter(Boolean) ?? [];
			const last = segments[segments.length - 1] ?? "";
			return indexTokenSegmentRegex.test(last) ? -1 : 1;
		},
		(d) => d.routePath
	]);
}
function cleanPath(path) {
	return path.replace(/\/{2,}/g, "/");
}
function trimPathLeft(path) {
	return path === "/" ? path : path.replace(/^\/{1,}/, "");
}
function removeLeadingSlash(path) {
	return path.replace(/^\//, "");
}
function removeTrailingSlash(s) {
	return s.replace(/\/$/, "");
}
var BRACKET_CONTENT_RE = /\[(.*?)\]/g;
var SPLIT_REGEX = /(?<!\[)\.(?!\])/g;
/**
* Characters that cannot be escaped in square brackets.
* These are characters that would cause issues in URLs or file systems.
*/
var DISALLOWED_ESCAPE_CHARS = new Set([
	"/",
	"\\",
	"?",
	"#",
	":",
	"*",
	"<",
	">",
	"|",
	"!",
	"$",
	"%"
]);
function determineInitialRoutePathFromParts(routePath, parts) {
	const originalRoutePath = cleanPath(`/${cleanPath(parts.join("/")) || ""}`) || "";
	return {
		routePath: cleanPath(`/${parts.map((part) => {
			let match;
			while ((match = BRACKET_CONTENT_RE.exec(part)) !== null) {
				const character = match[1];
				if (character === void 0) continue;
				if (DISALLOWED_ESCAPE_CHARS.has(character)) {
					console.error(`Error: Disallowed character "${character}" found in square brackets in route path "${routePath}".\nYou cannot use any of the following characters in square brackets: ${Array.from(DISALLOWED_ESCAPE_CHARS).join(", ")}\nPlease remove and/or replace them.`);
					process.exit(1);
				}
			}
			return part.replace(BRACKET_CONTENT_RE, "$1");
		}).join("/")}`) || "",
		originalRoutePath
	};
}
function determineInitialRoutePath(routePath) {
	return determineInitialRoutePathFromParts(routePath, routePath.split(SPLIT_REGEX));
}
/**
* Resolves bracket escapes in an explicit route path or ID without applying
* the dot-delimited flat-file route convention.
*/
function determineInitialRoutePathFromExplicitPath(routePath) {
	return determineInitialRoutePathFromParts(routePath, [routePath]);
}
/**
* Checks if a segment is fully escaped (entirely wrapped in brackets with no nested brackets).
* E.g., "[index]" -> true, "[_layout]" -> true, "foo[.]bar" -> false, "index" -> false
*/
function isFullyEscapedSegment(originalSegment) {
	return originalSegment.startsWith("[") && originalSegment.endsWith("]") && !originalSegment.slice(1, -1).includes("[") && !originalSegment.slice(1, -1).includes("]");
}
/**
* Checks if the leading underscore in a segment is escaped.
* Returns true if:
* - Segment starts with [_] pattern: "[_]layout" -> "_layout"
* - Segment is fully escaped and content starts with _: "[_1nd3x]" -> "_1nd3x"
*/
function hasEscapedLeadingUnderscore(originalSegment) {
	return originalSegment.startsWith("[_]") || originalSegment.startsWith("[_") && isFullyEscapedSegment(originalSegment);
}
/**
* Checks if the trailing underscore in a segment is escaped.
* Returns true if:
* - Segment ends with [_] pattern: "blog[_]" -> "blog_"
* - Segment is fully escaped and content ends with _: "[_r0ut3_]" -> "_r0ut3_"
*/
function hasEscapedTrailingUnderscore(originalSegment) {
	return originalSegment.endsWith("[_]") || originalSegment.endsWith("_]") && isFullyEscapedSegment(originalSegment);
}
function countRoutePathSegments(routePath) {
	const path = routePath ?? "";
	let count = 0;
	let inSegment = false;
	for (let i = 0; i < path.length; i++) {
		if (path[i] === "/") {
			inSegment = false;
			continue;
		}
		if (!inSegment) {
			count++;
			inSegment = true;
		}
	}
	return count;
}
function countSlashSeparatedParts(path) {
	let count = 1;
	for (let i = 0; i < path.length; i++) if (path[i] === "/") count++;
	return count;
}
function hasRoutePathSegmentMetadata(metadata) {
	return !!(metadata?.literalLeadingUnderscore || metadata?.literalTrailingUnderscore);
}
function mergeRoutePathSegmentMetadata(current, incoming) {
	const hasCurrent = hasRoutePathSegmentMetadata(current);
	const hasIncoming = hasRoutePathSegmentMetadata(incoming);
	if (!hasCurrent) return hasIncoming ? incoming : void 0;
	if (!hasIncoming) return current;
	return {
		literalLeadingUnderscore: current.literalLeadingUnderscore || incoming.literalLeadingUnderscore,
		literalTrailingUnderscore: current.literalTrailingUnderscore || incoming.literalTrailingUnderscore
	};
}
function createRoutePathSegmentMetadata(routePath = "/", originalPath) {
	if (!originalPath) return void 0;
	const routeSegments = routePath.split("/");
	const originalSegments = originalPath.split("/");
	const metadata = new Array(routeSegments.length);
	let hasMetadata = false;
	for (let i = 0; i < routeSegments.length; i++) {
		const segment = routeSegments[i];
		const originalSegment = originalSegments[i] || "";
		const literalLeadingUnderscore = segment.startsWith("_") && hasEscapedLeadingUnderscore(originalSegment);
		const literalTrailingUnderscore = segment.endsWith("_") && hasEscapedTrailingUnderscore(originalSegment);
		if (!literalLeadingUnderscore && !literalTrailingUnderscore) continue;
		hasMetadata = true;
		metadata[i] = {
			literalLeadingUnderscore: literalLeadingUnderscore || void 0,
			literalTrailingUnderscore: literalTrailingUnderscore || void 0
		};
	}
	return hasMetadata ? metadata : void 0;
}
function createLiteralRoutePathSegmentMetadata(routePath, parent, literalNewSegments = false) {
	const routeSegments = routePath.split("/");
	const metadata = new Array(routeSegments.length);
	const parentDepth = countRoutePathSegments(parent?.routePath);
	let hasMetadata = false;
	let depth = 0;
	for (let i = 0; i < routeSegments.length; i++) {
		const segment = routeSegments[i];
		metadata[i] = parent?._routePathSegmentMetadata?.[i];
		hasMetadata ||= hasRoutePathSegmentMetadata(metadata[i]);
		if (!segment) continue;
		if (literalNewSegments && depth >= parentDepth) {
			const literalLeadingUnderscore = segment.startsWith("_");
			const literalTrailingUnderscore = segment.endsWith("_");
			if (literalLeadingUnderscore || literalTrailingUnderscore) {
				metadata[i] = mergeRoutePathSegmentMetadata(metadata[i], {
					literalLeadingUnderscore: literalLeadingUnderscore || void 0,
					literalTrailingUnderscore: literalTrailingUnderscore || void 0
				});
				hasMetadata = true;
			}
		}
		depth++;
	}
	return hasMetadata ? metadata : void 0;
}
function joinRoutePathSegmentMetadata(routePath, prefixPath, prefixMetadata, childMetadata) {
	const metadata = new Array(countSlashSeparatedParts(routePath));
	let hasMetadata = false;
	if (prefixMetadata) for (let i = 0; i < prefixMetadata.length && i < metadata.length; i++) {
		metadata[i] = prefixMetadata[i];
		hasMetadata ||= hasRoutePathSegmentMetadata(metadata[i]);
	}
	const offset = countRoutePathSegments(prefixPath);
	if (childMetadata) for (let i = 1; i < childMetadata.length; i++) {
		const targetIndex = offset + i;
		if (targetIndex >= metadata.length) break;
		metadata[targetIndex] = mergeRoutePathSegmentMetadata(metadata[targetIndex], childMetadata[i]);
		hasMetadata ||= hasRoutePathSegmentMetadata(metadata[targetIndex]);
	}
	return hasMetadata ? metadata : void 0;
}
var backslashRegex = /\\/g;
function replaceBackslash(s) {
	return s.replace(backslashRegex, "/");
}
var alphanumericRegex = /[a-zA-Z0-9_]/;
var splatSlashRegex = /\/\$\//g;
var trailingSplatRegex = /\$$/g;
var bracketSplatRegex = /\$\{\$\}/g;
var dollarSignRegex = /\$/g;
var splitPathRegex = /[/-]/g;
var leadingDigitRegex = /^(\d)/g;
var toVariableSafeChar = (char) => {
	if (alphanumericRegex.test(char)) return char;
	switch (char) {
		case ".": return "Dot";
		case "-": return "Dash";
		case "@": return "At";
		case "(": return "";
		case ")": return "";
		case " ": return "";
		default: return `Char${char.charCodeAt(0)}`;
	}
};
function routePathToVariable(routePath) {
	const cleaned = removeUnderscores(routePath);
	if (!cleaned) return "";
	const parts = cleaned.replace(splatSlashRegex, "/splat/").replace(trailingSplatRegex, "splat").replace(bracketSplatRegex, "splat").replace(dollarSignRegex, "").split(splitPathRegex);
	let result = "";
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		const segment = i > 0 ? capitalize(part) : part;
		for (let j = 0; j < segment.length; j++) result += toVariableSafeChar(segment[j]);
	}
	return result.replace(leadingDigitRegex, "R$1");
}
var underscoreStartEndRegex = /(^_|_$)/gi;
var underscoreSlashRegex = /(\/_|_\/)/gi;
function removeUnderscores(s) {
	return s?.replace(underscoreStartEndRegex, "").replace(underscoreSlashRegex, "/");
}
function removeUnderscoresFromSegment(segment, metadata) {
	let result = segment;
	if (result.startsWith("_") && !metadata?.literalLeadingUnderscore) result = result.slice(1);
	if (result.endsWith("_") && !metadata?.literalTrailingUnderscore) result = result.slice(0, -1);
	return result;
}
function removeLayoutSegmentsAndUnderscoresWithEscape(routePath = "/", originalPath, routePathSegmentMetadata) {
	if (!originalPath) return removeUnderscores(removeLayoutSegments(routePath)) ?? "";
	const metadata = routePathSegmentMetadata ?? createRoutePathSegmentMetadata(routePath, originalPath);
	const routeSegments = routePath.split("/");
	const originalSegments = originalPath.split("/");
	const newSegments = [];
	for (let i = 0; i < routeSegments.length; i++) {
		const segment = routeSegments[i];
		const originalSegment = originalSegments[i] || "";
		const segmentMetadata = metadata?.[i];
		if (!segmentMetadata?.literalLeadingUnderscore && isSegmentPathless(segment, originalSegment)) continue;
		newSegments.push(removeUnderscoresFromSegment(segment, segmentMetadata));
	}
	return newSegments.join("/");
}
/**
* Checks if a segment should be treated as a pathless/layout segment.
* A segment is pathless if it starts with underscore and the underscore is not escaped.
*
* @param segment - The segment from routePath (brackets removed)
* @param originalSegment - The segment from originalRoutePath (may contain brackets)
* @returns true if the segment is pathless (has non-escaped leading underscore)
*/
function isSegmentPathless(segment, originalSegment) {
	if (!segment.startsWith("_")) return false;
	return !hasEscapedLeadingUnderscore(originalSegment);
}
function escapeRegExp(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function sanitizeTokenFlags(flags) {
	if (!flags) return flags;
	return flags.replace(/[gy]/g, "");
}
function createTokenRegex(token, opts) {
	if (token === void 0 || token === null) throw new Error(`createTokenRegex: token is ${token}. This usually means the config was not properly parsed with defaults.`);
	try {
		if (typeof token === "string") return opts.type === "segment" ? new RegExp(`^${escapeRegExp(token)}$`) : new RegExp(`[./]${escapeRegExp(token)}[.]`);
		if (token instanceof RegExp) {
			const flags = sanitizeTokenFlags(token.flags);
			return opts.type === "segment" ? new RegExp(`^(?:${token.source})$`, flags) : new RegExp(`[./](?:${token.source})[.]`, flags);
		}
		if (typeof token === "object" && "regex" in token) {
			const flags = sanitizeTokenFlags(token.flags);
			return opts.type === "segment" ? new RegExp(`^(?:${token.regex})$`, flags) : new RegExp(`[./](?:${token.regex})[.]`, flags);
		}
		throw new Error(`createTokenRegex: invalid token type. Expected string, RegExp, or { regex, flags } object, got: ${typeof token}`);
	} catch (e) {
		if (e instanceof SyntaxError) {
			const pattern = typeof token === "string" ? token : token instanceof RegExp ? token.source : token.regex;
			throw new Error(`Invalid regex pattern in token config: "${pattern}". ${e.message}`);
		}
		throw e;
	}
}
function isBracketWrappedSegment(segment) {
	return segment.startsWith("[") && segment.endsWith("]");
}
function unwrapBracketWrappedSegment(segment) {
	return isBracketWrappedSegment(segment) ? segment.slice(1, -1) : segment;
}
function capitalize(s) {
	if (typeof s !== "string") return "";
	return s.charAt(0).toUpperCase() + s.slice(1);
}
function removeExt(d, addExtensions = false) {
	if (typeof addExtensions === "string") {
		const dotIndex = d.lastIndexOf(".");
		if (dotIndex === -1) return d;
		return d.substring(0, dotIndex) + addExtensions;
	}
	return addExtensions ? d : d.substring(0, d.lastIndexOf(".")) || d;
}
/**
* This function writes to a file if the content is different.
*
* @param filepath The path to the file
* @param content Original content
* @param incomingContent New content
* @param callbacks Callbacks to run before and after writing
* @returns Whether the file was written
*/
async function writeIfDifferent(filepath, content, incomingContent, callbacks) {
	if (content !== incomingContent) {
		callbacks?.beforeWrite?.();
		await node_fs_promises.writeFile(filepath, incomingContent);
		callbacks?.afterWrite?.();
		return true;
	}
	return false;
}
/**
* This function formats the source code using the default formatter (Prettier).
*
* @param source The content to format
* @param config The configuration object
* @returns The formatted content
*/
async function format(source, config) {
	const prettierOptions = {
		semi: config.semicolons,
		singleQuote: config.quoteStyle === "single",
		parser: "typescript"
	};
	return prettier.format(source, prettierOptions);
}
/**
* This function resets the regex index to 0 so that it can be reused
* without having to create a new regex object or worry about the last
* state when using the global flag.
*
* @param regex The regex object to reset
* @returns
*/
function resetRegex(regex) {
	regex.lastIndex = 0;
}
/**
* This function checks if a file exists.
*
* @param file The path to the file
* @returns Whether the file exists
*/
async function checkFileExists(file) {
	try {
		await node_fs_promises.access(file, node_fs_promises.constants.F_OK);
		return true;
	} catch {
		return false;
	}
}
var possiblyNestedRouteGroupPatternRegex = /\([^/]+\)\/?/g;
function removeGroups(s) {
	return s.replace(possiblyNestedRouteGroupPatternRegex, "");
}
/**
* Removes all segments from a given path that start with an underscore ('_').
*
* @param {string} routePath - The path from which to remove segments. Defaults to '/'.
* @returns {string} The path with all underscore-prefixed segments removed.
* @example
* removeLayoutSegments('/workspace/_auth/foo') // '/workspace/foo'
*/
function removeLayoutSegments(routePath = "/") {
	return routePath.split("/").filter((segment) => !segment.startsWith("_")).join("/");
}
/**
* The `node.path` is used as the `id` in the route definition.
* This function checks if the given node has a parent and if so, it determines the correct path for the given node.
* @param node - The node to determine the path for.
* @returns The correct path for the given node.
*/
function determineNodePath(node) {
	return node.path = node.parent ? node.routePath?.replace(node.parent.routePath ?? "", "") || "/" : node.routePath;
}
/**
* Removes the last segment from a given path. Segments are considered to be separated by a '/'.
*
* @param {string} routePath - The path from which to remove the last segment. Defaults to '/'.
* @returns {string} The path with the last segment removed.
* @example
* removeLastSegmentFromPath('/workspace/_auth/foo') // '/workspace/_auth'
*/
function removeLastSegmentFromPath(routePath = "/") {
	const segments = routePath.split("/");
	segments.pop();
	return segments.join("/");
}
/**
* Find parent route using RoutePrefixMap for O(k) lookups instead of O(n).
*/
function hasParentRoute(prefixMap, node, routePathToCheck) {
	if (!routePathToCheck || routePathToCheck === "/") return null;
	return prefixMap.findParent(routePathToCheck);
}
/**
* Gets the final variable name for a route
*/
var getResolvedRouteNodeVariableName = (routeNode) => {
	return routeNode.children?.length ? `${routeNode.variableName}RouteWithChildren` : `${routeNode.variableName}Route`;
};
/**
* Infers the path for use by TS
*/
var inferPath = (routeNode) => {
	if (routeNode.cleanedPath === "/") return routeNode.cleanedPath ?? "";
	return routeNode.cleanedPath?.replace(/\/$/, "") ?? "";
};
/**
* Infers the full path for use by TS
*/
var inferFullPath = (routeNode) => {
	const fullPath = removeGroups(removeLayoutSegmentsAndUnderscoresWithEscape(routeNode.routePath, routeNode.originalRoutePath, routeNode._routePathSegmentMetadata));
	if (fullPath === "") return "/";
	if (routeNode.routePath?.endsWith("/")) return fullPath;
	return fullPath.replace(/\/$/, "");
};
var shouldPreferIndexRoute = (current, existing) => {
	return existing.cleanedPath === "/" && current.cleanedPath !== "/";
};
var isIndexRouteNode = (routeNode) => {
	return routeNode.routePath?.endsWith("/") ?? false;
};
var isPathlessRouteNode = (routeNode) => {
	return routeNode._fsRouteType === "pathless_layout";
};
var shouldReplaceRouteNodeForTo = (current, existing) => {
	const currentIsIndex = isIndexRouteNode(current);
	if (currentIsIndex !== isIndexRouteNode(existing)) return currentIsIndex;
	const currentIsPathless = isPathlessRouteNode(current);
	if (currentIsPathless !== isPathlessRouteNode(existing)) return !currentIsPathless;
	return true;
};
var shouldReplaceRouteNodeForFullPath = (current, existing) => {
	const currentIsPathless = isPathlessRouteNode(current);
	if (currentIsPathless !== isPathlessRouteNode(existing)) return !currentIsPathless;
	return true;
};
/**
* Creates a map from fullPath to routeNode
*/
var createRouteNodesByFullPath = (routeNodes) => {
	const map = /* @__PURE__ */ new Map();
	for (const routeNode of routeNodes) {
		const fullPath = inferFullPath(routeNode);
		if (fullPath === "/" && map.has("/")) {
			if (shouldPreferIndexRoute(routeNode, map.get("/"))) continue;
		}
		const existing = map.get(fullPath);
		if (existing && !shouldReplaceRouteNodeForFullPath(routeNode, existing)) continue;
		map.set(fullPath, routeNode);
	}
	return map;
};
/**
* Create a map from 'to' to a routeNode
*/
var createRouteNodesByTo = (routeNodes) => {
	const map = /* @__PURE__ */ new Map();
	for (const routeNode of dedupeBranchesAndIndexRoutes(routeNodes)) {
		const to = inferTo(routeNode);
		const existing = map.get(to);
		if (existing && !shouldReplaceRouteNodeForTo(routeNode, existing)) continue;
		map.set(to, routeNode);
	}
	return map;
};
/**
* Create a map from 'id' to a routeNode
*/
var createRouteNodesById = (routeNodes) => {
	return new Map(routeNodes.map((routeNode) => {
		return [routeNode.routePath ?? "", routeNode];
	}));
};
/**
* Infers to path
*/
var inferTo = (routeNode) => {
	const fullPath = inferFullPath(routeNode);
	if (fullPath === "/") return fullPath;
	return fullPath.replace(/\/$/, "");
};
/**
* Dedupes branches and index routes
*/
var dedupeBranchesAndIndexRoutes = (routes) => {
	return routes.filter((route) => {
		if (route.children?.find((child) => child.cleanedPath === "/")) return false;
		return true;
	});
};
function checkUnique(routes, key) {
	const keys = routes.map((d) => d[key]);
	const uniqueKeys = new Set(keys);
	if (keys.length !== uniqueKeys.size) {
		const duplicateKeys = keys.filter((d, i) => keys.indexOf(d) !== i);
		return routes.filter((d) => duplicateKeys.includes(d[key]));
	}
}
function checkRouteFullPathUniqueness(_routes, config) {
	const emptyPathRoutes = _routes.filter((d) => d.routePath === "");
	if (emptyPathRoutes.length) {
		const errorMessage = `Invalid route path "" was found. Root routes must be defined via __root.tsx (createRootRoute), not createFileRoute('') or a route file that resolves to an empty path.
Conflicting files: \n ${emptyPathRoutes.map((d) => node_path.default.resolve(config.routesDirectory, d.filePath)).join("\n ")}\n`;
		throw new Error(errorMessage);
	}
	const conflictingFiles = checkUnique(_routes.map((d) => {
		const inferredFullPath = inferFullPath(d);
		return {
			...d,
			inferredFullPath
		};
	}), "inferredFullPath");
	if (conflictingFiles !== void 0) {
		const errorMessage = `Conflicting configuration paths were found for the following route${conflictingFiles.length > 1 ? "s" : ""}: ${conflictingFiles.map((p) => `"${p.inferredFullPath}"`).join(", ")}.
Please ensure each Route has a unique full path.
Conflicting files: \n ${conflictingFiles.map((d) => node_path.default.resolve(config.routesDirectory, d.filePath)).join("\n ")}\n`;
		throw new Error(errorMessage);
	}
}
function buildRouteTreeConfig(nodes, disableTypes, depth = 1) {
	return nodes.map((node) => {
		if (node._fsRouteType === "__root") return;
		if (node._fsRouteType === "pathless_layout" && !node.children?.length) return;
		const route = `${node.variableName}`;
		if (node.children?.length) {
			const childConfigs = buildRouteTreeConfig(node.children, disableTypes, depth + 1);
			const childrenDeclaration = disableTypes ? "" : `interface ${route}RouteChildren {
  ${node.children.map((child) => `${child.variableName}Route: typeof ${getResolvedRouteNodeVariableName(child)}`).join(",")}
}`;
			const children = `const ${route}RouteChildren${disableTypes ? "" : `: ${route}RouteChildren`} = {
  ${node.children.map((child) => `${child.variableName}Route: ${getResolvedRouteNodeVariableName(child)}`).join(",")}
}`;
			const routeWithChildren = `const ${route}RouteWithChildren = ${route}Route._addFileChildren(${route}RouteChildren)`;
			return [
				childConfigs.join("\n"),
				childrenDeclaration,
				children,
				routeWithChildren
			].join("\n\n");
		}
	}).filter((x) => x !== void 0);
}
function buildImportString(importDeclaration) {
	const { source, specifiers, importKind } = importDeclaration;
	return specifiers.length ? `import ${importKind === "type" ? "type " : ""}{ ${specifiers.map((s) => s.local ? `${s.imported} as ${s.local}` : s.imported).join(", ")} } from '${source}'` : "";
}
function mergeImportDeclarations(imports) {
	const merged = /* @__PURE__ */ new Map();
	for (const imp of imports) {
		const key = `${imp.source}-${imp.importKind ?? ""}`;
		let existing = merged.get(key);
		if (!existing) {
			existing = {
				...imp,
				specifiers: []
			};
			merged.set(key, existing);
		}
		const existingSpecs = existing.specifiers;
		for (const specifier of imp.specifiers) {
			let found = false;
			for (let i = 0; i < existingSpecs.length; i++) {
				const e = existingSpecs[i];
				if (e.imported === specifier.imported && e.local === specifier.local) {
					found = true;
					break;
				}
			}
			if (!found) existingSpecs.push(specifier);
		}
	}
	return [...merged.values()];
}
var findParent = (node) => {
	if (!node) return `rootRouteImport`;
	if (node.parent) return `${node.parent.variableName}Route`;
	return findParent(node.parent);
};
function buildFileRoutesByPathInterface(opts) {
	return `declare module '${opts.module}' {
  interface ${opts.interfaceName} {
    ${opts.routeNodes.map((routeNode) => {
		const filePathId = routeNode.routePath;
		const preloaderRoute = `typeof ${routeNode.variableName}RouteImport`;
		const parent = findParent(routeNode);
		return `'${filePathId}': {
          id: '${filePathId}'
          path: '${inferPath(routeNode)}'
          fullPath: '${inferFullPath(routeNode)}'
          preLoaderRoute: ${preloaderRoute}
          parentRoute: typeof ${parent}
        }`;
	}).join("\n")}
  }
}`;
}
function getImportPath(node, config, generatedRouteTreePath) {
	return replaceBackslash(removeExt(node_path.default.relative(node_path.default.dirname(generatedRouteTreePath), node_path.default.resolve(config.routesDirectory, node.filePath)), config.addExtensions));
}
function getImportForRouteNode(node, config, generatedRouteTreePath, root) {
	let source = "";
	if (config.importRoutesUsingAbsolutePaths) source = replaceBackslash(removeExt(node_path.default.resolve(root, config.routesDirectory, node.filePath), config.addExtensions));
	else source = `./${getImportPath(node, config, generatedRouteTreePath)}`;
	return {
		source,
		specifiers: [{
			imported: "Route",
			local: `${node.variableName}RouteImport`
		}]
	};
}
//#endregion
exports.RoutePrefixMap = RoutePrefixMap;
exports.buildFileRoutesByPathInterface = buildFileRoutesByPathInterface;
exports.buildImportString = buildImportString;
exports.buildRouteTreeConfig = buildRouteTreeConfig;
exports.capitalize = capitalize;
exports.checkFileExists = checkFileExists;
exports.checkRouteFullPathUniqueness = checkRouteFullPathUniqueness;
exports.cleanPath = cleanPath;
exports.countRoutePathSegments = countRoutePathSegments;
exports.countSlashSeparatedParts = countSlashSeparatedParts;
exports.createLiteralRoutePathSegmentMetadata = createLiteralRoutePathSegmentMetadata;
exports.createRouteNodesByFullPath = createRouteNodesByFullPath;
exports.createRouteNodesById = createRouteNodesById;
exports.createRouteNodesByTo = createRouteNodesByTo;
exports.createRoutePathSegmentMetadata = createRoutePathSegmentMetadata;
exports.createTokenRegex = createTokenRegex;
exports.determineInitialRoutePath = determineInitialRoutePath;
exports.determineInitialRoutePathFromExplicitPath = determineInitialRoutePathFromExplicitPath;
exports.determineNodePath = determineNodePath;
exports.escapeRegExp = escapeRegExp;
exports.findParent = findParent;
exports.format = format;
exports.getImportForRouteNode = getImportForRouteNode;
exports.getResolvedRouteNodeVariableName = getResolvedRouteNodeVariableName;
exports.hasEscapedLeadingUnderscore = hasEscapedLeadingUnderscore;
exports.hasParentRoute = hasParentRoute;
exports.inferFullPath = inferFullPath;
exports.isSegmentPathless = isSegmentPathless;
exports.joinRoutePathSegmentMetadata = joinRoutePathSegmentMetadata;
exports.mergeImportDeclarations = mergeImportDeclarations;
exports.multiSortBy = multiSortBy;
exports.removeExt = removeExt;
exports.removeGroups = removeGroups;
exports.removeLastSegmentFromPath = removeLastSegmentFromPath;
exports.removeLayoutSegmentsAndUnderscoresWithEscape = removeLayoutSegmentsAndUnderscoresWithEscape;
exports.removeLeadingSlash = removeLeadingSlash;
exports.removeTrailingSlash = removeTrailingSlash;
exports.removeUnderscores = removeUnderscores;
exports.replaceBackslash = replaceBackslash;
exports.resetRegex = resetRegex;
exports.routePathToVariable = routePathToVariable;
exports.sortRouteNodes = sortRouteNodes;
exports.trimPathLeft = trimPathLeft;
exports.unwrapBracketWrappedSegment = unwrapBracketWrappedSegment;
exports.writeIfDifferent = writeIfDifferent;

//# sourceMappingURL=utils.cjs.map