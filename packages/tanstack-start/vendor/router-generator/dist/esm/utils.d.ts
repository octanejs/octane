import { Config, TokenMatcher } from './config.js';
import { ImportDeclaration, RouteNode, RoutePathSegmentMetadata } from './types.js';
/**
 * Prefix map for O(1) parent route lookups.
 * Maps each route path prefix to the route node that owns that prefix.
 * Enables finding longest matching parent without linear search.
 */
export declare class RoutePrefixMap {
    private prefixToRoute;
    constructor(routes: Array<RouteNode>);
    /**
     * Find the longest matching parent route for a given path.
     * O(k) where k is the number of path segments, not O(n) routes.
     */
    findParent(routePath: string): RouteNode | null;
    /**
     * Check if a route exists at the given path.
     */
    has(routePath: string): boolean;
    /**
     * Get a route by exact path.
     */
    get(routePath: string): RouteNode | undefined;
}
export declare function multiSortBy<T>(arr: Array<T>, accessors?: Array<(item: T) => any>): Array<T>;
/**
 * Sorts route nodes by root, path depth, index status, and finally `routePath`.
 * The `routePath` comparison keeps the output consistent when the earlier
 * values are the same.
 */
export declare function sortRouteNodes(routeNodes: Array<RouteNode>, indexTokenSegmentRegex: RegExp): Array<RouteNode>;
export declare function cleanPath(path: string): string;
export declare function trimPathLeft(path: string): string;
export declare function removeLeadingSlash(path: string): string;
export declare function removeTrailingSlash(s: string): string;
export declare function determineInitialRoutePath(routePath: string): {
    routePath: string;
    originalRoutePath: string;
};
/**
 * Resolves bracket escapes in an explicit route path or ID without applying
 * the dot-delimited flat-file route convention.
 */
export declare function determineInitialRoutePathFromExplicitPath(routePath: string): {
    routePath: string;
    originalRoutePath: string;
};
/**
 * Checks if the leading underscore in a segment is escaped.
 * Returns true if:
 * - Segment starts with [_] pattern: "[_]layout" -> "_layout"
 * - Segment is fully escaped and content starts with _: "[_1nd3x]" -> "_1nd3x"
 */
export declare function hasEscapedLeadingUnderscore(originalSegment: string): boolean;
/**
 * Checks if the trailing underscore in a segment is escaped.
 * Returns true if:
 * - Segment ends with [_] pattern: "blog[_]" -> "blog_"
 * - Segment is fully escaped and content ends with _: "[_r0ut3_]" -> "_r0ut3_"
 */
export declare function hasEscapedTrailingUnderscore(originalSegment: string): boolean;
export declare function countRoutePathSegments(routePath?: string): number;
export declare function countSlashSeparatedParts(path: string): number;
export declare function hasRoutePathSegmentMetadata(metadata: RoutePathSegmentMetadata | undefined): metadata is RoutePathSegmentMetadata;
export declare function createRoutePathSegmentMetadata(routePath?: string, originalPath?: string): Array<RoutePathSegmentMetadata | undefined> | undefined;
export declare function createLiteralRoutePathSegmentMetadata(routePath: string, parent?: RouteNode, literalNewSegments?: boolean): Array<RoutePathSegmentMetadata | undefined> | undefined;
export declare function joinRoutePathSegmentMetadata(routePath: string, prefixPath: string, prefixMetadata: Array<RoutePathSegmentMetadata | undefined> | undefined, childMetadata: Array<RoutePathSegmentMetadata | undefined> | undefined): Array<RoutePathSegmentMetadata | undefined> | undefined;
export declare function replaceBackslash(s: string): string;
export declare function routePathToVariable(routePath: string): string;
export declare function removeUnderscores(s?: string): string | undefined;
/**
 * Removes underscores from a path, but preserves underscores that were escaped
 * in the original path (indicated by [_] syntax).
 *
 * @param routePath - The path with brackets removed
 * @param originalPath - The original path that may contain [_] escape sequences
 * @returns The path with non-escaped underscores removed
 */
export declare function removeUnderscoresWithEscape(routePath?: string, originalPath?: string): string;
export declare function removeLayoutSegmentsAndUnderscoresWithEscape(routePath?: string, originalPath?: string, routePathSegmentMetadata?: Array<RoutePathSegmentMetadata | undefined>): string;
/**
 * Removes layout segments (segments starting with underscore) from a path,
 * but preserves segments where the underscore was escaped.
 *
 * @param routePath - The path with brackets removed
 * @param originalPath - The original path that may contain [_] escape sequences
 * @returns The path with non-escaped layout segments removed
 */
export declare function removeLayoutSegmentsWithEscape(routePath?: string, originalPath?: string): string;
/**
 * Checks if a segment should be treated as a pathless/layout segment.
 * A segment is pathless if it starts with underscore and the underscore is not escaped.
 *
 * @param segment - The segment from routePath (brackets removed)
 * @param originalSegment - The segment from originalRoutePath (may contain brackets)
 * @returns true if the segment is pathless (has non-escaped leading underscore)
 */
export declare function isSegmentPathless(segment: string, originalSegment: string): boolean;
export declare function escapeRegExp(s: string): string;
export declare function createTokenRegex(token: TokenMatcher, opts: {
    type: 'segment' | 'filename';
}): RegExp;
export declare function unwrapBracketWrappedSegment(segment: string): string;
export declare function removeLeadingUnderscores(s: string, routeToken: string): string;
export declare function removeTrailingUnderscores(s: string, routeToken: string): string;
export declare function capitalize(s: string): string;
export declare function removeExt(d: string, addExtensions?: boolean | string): string;
/**
 * This function writes to a file if the content is different.
 *
 * @param filepath The path to the file
 * @param content Original content
 * @param incomingContent New content
 * @param callbacks Callbacks to run before and after writing
 * @returns Whether the file was written
 */
export declare function writeIfDifferent(filepath: string, content: string, incomingContent: string, callbacks?: {
    beforeWrite?: () => void;
    afterWrite?: () => void;
}): Promise<boolean>;
/**
 * This function formats the source code using the default formatter (Prettier).
 *
 * @param source The content to format
 * @param config The configuration object
 * @returns The formatted content
 */
export declare function format(source: string, config: {
    quoteStyle: 'single' | 'double';
    semicolons: boolean;
}): Promise<string>;
/**
 * This function resets the regex index to 0 so that it can be reused
 * without having to create a new regex object or worry about the last
 * state when using the global flag.
 *
 * @param regex The regex object to reset
 * @returns
 */
export declare function resetRegex(regex: RegExp): void;
/**
 * This function checks if a file exists.
 *
 * @param file The path to the file
 * @returns Whether the file exists
 */
export declare function checkFileExists(file: string): Promise<boolean>;
export declare function removeGroups(s: string): string;
/**
 * Removes all segments from a given path that start with an underscore ('_').
 *
 * @param {string} routePath - The path from which to remove segments. Defaults to '/'.
 * @returns {string} The path with all underscore-prefixed segments removed.
 * @example
 * removeLayoutSegments('/workspace/_auth/foo') // '/workspace/foo'
 */
export declare function removeLayoutSegments(routePath?: string): string;
/**
 * The `node.path` is used as the `id` in the route definition.
 * This function checks if the given node has a parent and if so, it determines the correct path for the given node.
 * @param node - The node to determine the path for.
 * @returns The correct path for the given node.
 */
export declare function determineNodePath(node: RouteNode): string | undefined;
/**
 * Removes the last segment from a given path. Segments are considered to be separated by a '/'.
 *
 * @param {string} routePath - The path from which to remove the last segment. Defaults to '/'.
 * @returns {string} The path with the last segment removed.
 * @example
 * removeLastSegmentFromPath('/workspace/_auth/foo') // '/workspace/_auth'
 */
export declare function removeLastSegmentFromPath(routePath?: string): string;
/**
 * Find parent route using RoutePrefixMap for O(k) lookups instead of O(n).
 */
export declare function hasParentRoute(prefixMap: RoutePrefixMap, node: RouteNode, routePathToCheck: string | undefined): RouteNode | null;
/**
 * Gets the final variable name for a route
 */
export declare const getResolvedRouteNodeVariableName: (routeNode: RouteNode) => string;
/**
 * Infers the full path for use by TS
 */
export declare const inferFullPath: (routeNode: RouteNode) => string;
/**
 * Creates a map from fullPath to routeNode
 */
export declare const createRouteNodesByFullPath: (routeNodes: Array<RouteNode>) => Map<string, RouteNode>;
/**
 * Create a map from 'to' to a routeNode
 */
export declare const createRouteNodesByTo: (routeNodes: Array<RouteNode>) => Map<string, RouteNode>;
/**
 * Create a map from 'id' to a routeNode
 */
export declare const createRouteNodesById: (routeNodes: Array<RouteNode>) => Map<string, RouteNode>;
export declare function checkRouteFullPathUniqueness(_routes: Array<RouteNode>, config: Config): void;
export declare function buildRouteTreeConfig(nodes: Array<RouteNode>, disableTypes: boolean, depth?: number): Array<string>;
export declare function buildImportString(importDeclaration: ImportDeclaration): string;
export declare function mergeImportDeclarations(imports: Array<ImportDeclaration>): Array<ImportDeclaration>;
export declare const findParent: (node: RouteNode | undefined) => string;
export declare function buildFileRoutesByPathInterface(opts: {
    routeNodes: Array<RouteNode>;
    module: string;
    interfaceName: string;
    config?: Pick<Config, 'routeToken'>;
}): string;
export declare function getImportForRouteNode(node: RouteNode, config: Config, generatedRouteTreePath: string, root: string): ImportDeclaration;
