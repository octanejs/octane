import { resolveViteId } from "../../utils.js";
import { MARKER_PREFIX, MOCK_BUILD_PREFIX, MOCK_EDGE_PREFIX, MOCK_MODULE_ID, MOCK_RUNTIME_PREFIX, VITE_BROWSER_VIRTUAL_PREFIX } from "../../import-protection/constants.js";
import { loadMarkerModule, loadMockEdgeModule, loadMockRuntimeModule, loadSilentMockModule } from "../../import-protection/virtualModules.js";
//#region src/vite/import-protection-plugin/virtualModules.ts
var RESOLVED_MOCK_MODULE_ID = resolveViteId(MOCK_MODULE_ID);
var RESOLVED_MOCK_BUILD_PREFIX = resolveViteId(MOCK_BUILD_PREFIX);
var RESOLVED_MOCK_EDGE_PREFIX = resolveViteId(MOCK_EDGE_PREFIX);
var RESOLVED_MOCK_RUNTIME_PREFIX = resolveViteId(MOCK_RUNTIME_PREFIX);
var RESOLVED_MARKER_PREFIX = resolveViteId(MARKER_PREFIX);
var RESOLVED_MARKER_SERVER_ONLY = resolveViteId(`${MARKER_PREFIX}server-only`);
var RESOLVED_MARKER_CLIENT_ONLY = resolveViteId(`${MARKER_PREFIX}client-only`);
function resolvedMarkerVirtualModuleId(kind) {
	return kind === "server" ? RESOLVED_MARKER_SERVER_ONLY : RESOLVED_MARKER_CLIENT_ONLY;
}
function getResolvedVirtualModuleMatchers() {
	return RESOLVED_VIRTUAL_MODULE_MATCHERS;
}
var RESOLVED_VIRTUAL_MODULE_MATCHERS = [
	RESOLVED_MOCK_MODULE_ID,
	RESOLVED_MOCK_BUILD_PREFIX,
	RESOLVED_MOCK_EDGE_PREFIX,
	RESOLVED_MOCK_RUNTIME_PREFIX,
	RESOLVED_MARKER_PREFIX
];
var RESOLVE_PREFIX_PAIRS = [
	[MOCK_EDGE_PREFIX, RESOLVED_MOCK_EDGE_PREFIX],
	[MOCK_RUNTIME_PREFIX, RESOLVED_MOCK_RUNTIME_PREFIX],
	[MOCK_BUILD_PREFIX, RESOLVED_MOCK_BUILD_PREFIX],
	[MARKER_PREFIX, RESOLVED_MARKER_PREFIX]
];
function resolveInternalVirtualModuleId(source) {
	if (source.startsWith("/@id/__x00__")) return resolveInternalVirtualModuleId(`\0${source.slice(VITE_BROWSER_VIRTUAL_PREFIX.length)}`);
	if (source === "tanstack-start-import-protection:mock" || source === RESOLVED_MOCK_MODULE_ID) return RESOLVED_MOCK_MODULE_ID;
	for (const [unresolvedPrefix, resolvedPrefix] of RESOLVE_PREFIX_PAIRS) {
		if (source.startsWith(unresolvedPrefix)) return resolveViteId(source);
		if (source.startsWith(resolvedPrefix)) return source;
	}
}
function loadResolvedVirtualModule(id) {
	if (id === RESOLVED_MOCK_MODULE_ID) return loadSilentMockModule();
	if (id.startsWith(RESOLVED_MOCK_BUILD_PREFIX)) return loadSilentMockModule();
	if (id.startsWith(RESOLVED_MOCK_EDGE_PREFIX)) return loadMockEdgeModule(id.slice(RESOLVED_MOCK_EDGE_PREFIX.length));
	if (id.startsWith(RESOLVED_MOCK_RUNTIME_PREFIX)) return loadMockRuntimeModule(id.slice(RESOLVED_MOCK_RUNTIME_PREFIX.length));
	if (id.startsWith(RESOLVED_MARKER_PREFIX)) return loadMarkerModule();
}
//#endregion
export { getResolvedVirtualModuleMatchers, loadResolvedVirtualModule, resolveInternalVirtualModuleId, resolvedMarkerVirtualModuleId };

//# sourceMappingURL=virtualModules.js.map