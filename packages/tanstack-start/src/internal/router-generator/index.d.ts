export { configSchema, getConfig, resolveConfigPath, baseConfigSchema } from './config.js';
export type { Config, BaseConfig } from './config.js';
export { Generator } from './generator.js';
export type { FileEventType, FileEvent, GeneratorEvent } from './generator.js';
export type {
	FormatRouteOptions,
	GeneratorPlugin,
	TransformRouteSourceOptions,
} from './plugin/types.js';
export {
	capitalize,
	cleanPath,
	trimPathLeft,
	removeLeadingSlash,
	removeTrailingSlash,
	determineInitialRoutePath,
	replaceBackslash,
	routePathToVariable,
	removeUnderscores,
	resetRegex,
	multiSortBy,
	writeIfDifferent,
	format,
	removeExt,
	checkRouteFullPathUniqueness,
	inferFullPath,
} from './utils.js';
export type {
	RouteNode,
	GetRouteNodesResult,
	GetRoutesByFileMapResult,
	GetRoutesByFileMapResultValue,
	ImportDeclaration,
	ImportSpecifier,
	HandleNodeAccumulator,
} from './types.js';
export { getRouteNodes as physicalGetRouteNodes } from './filesystem/physical/getRouteNodes.js';
export { getRouteNodes as virtualGetRouteNodes } from './filesystem/virtual/getRouteNodes.js';
export { rootPathId } from './filesystem/physical/rootPathId.js';
export type { TransformContext, TransformOptions, TransformResult } from './transform/types.js';
