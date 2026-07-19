import { SERVER_FN_LOOKUP } from "../constants.js";
//#region src/import-protection/constants.ts
var SERVER_FN_LOOKUP_QUERY = `?${SERVER_FN_LOOKUP}`;
var MOCK_MODULE_ID = "tanstack-start-import-protection:mock";
var MOCK_BUILD_PREFIX = "tanstack-start-import-protection:mock:build:";
var MOCK_EDGE_PREFIX = "tanstack-start-import-protection:mock-edge:";
var MOCK_RUNTIME_PREFIX = "tanstack-start-import-protection:mock-runtime:";
var MARKER_PREFIX = "tanstack-start-import-protection:marker:";
var IMPORT_PROTECTION_DEBUG = process.env.TSR_IMPORT_PROTECTION_DEBUG === "1" || process.env.TSR_IMPORT_PROTECTION_DEBUG === "true";
var IMPORT_PROTECTION_DEBUG_FILTER = process.env.TSR_IMPORT_PROTECTION_DEBUG_FILTER;
var KNOWN_SOURCE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".tsrx",
	".mts",
	".cts",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".json"
]);
/** Vite's browser-visible prefix for virtual modules (replaces `\0`). */
var VITE_BROWSER_VIRTUAL_PREFIX = "/@id/__x00__";
//#endregion
export { IMPORT_PROTECTION_DEBUG, IMPORT_PROTECTION_DEBUG_FILTER, KNOWN_SOURCE_EXTENSIONS, MARKER_PREFIX, MOCK_BUILD_PREFIX, MOCK_EDGE_PREFIX, MOCK_MODULE_ID, MOCK_RUNTIME_PREFIX, SERVER_FN_LOOKUP_QUERY, VITE_BROWSER_VIRTUAL_PREFIX };

//# sourceMappingURL=constants.js.map