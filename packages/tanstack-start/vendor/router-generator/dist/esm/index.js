import { baseConfigSchema, configSchema, getConfig, resolveConfigPath } from "./config.js";
import { rootPathId } from "./filesystem/physical/rootPathId.js";
import { capitalize, checkRouteFullPathUniqueness, cleanPath, determineInitialRoutePath, format, inferFullPath, multiSortBy, removeExt, removeLeadingSlash, removeTrailingSlash, removeUnderscores, replaceBackslash, resetRegex, routePathToVariable, trimPathLeft, writeIfDifferent } from "./utils.js";
import { getRouteNodes as getRouteNodes$1 } from "./filesystem/virtual/getRouteNodes.js";
import { getRouteNodes } from "./filesystem/physical/getRouteNodes.js";
import { Generator } from "./generator.js";
export { Generator, baseConfigSchema, capitalize, checkRouteFullPathUniqueness, cleanPath, configSchema, determineInitialRoutePath, format, getConfig, inferFullPath, multiSortBy, getRouteNodes as physicalGetRouteNodes, removeExt, removeLeadingSlash, removeTrailingSlash, removeUnderscores, replaceBackslash, resetRegex, resolveConfigPath, rootPathId, routePathToVariable, trimPathLeft, getRouteNodes$1 as virtualGetRouteNodes, writeIfDifferent };
