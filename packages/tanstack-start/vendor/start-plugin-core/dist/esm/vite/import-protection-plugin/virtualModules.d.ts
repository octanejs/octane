import { MARKER_PREFIX, MOCK_BUILD_PREFIX, MOCK_EDGE_PREFIX, MOCK_MODULE_ID, MOCK_RUNTIME_PREFIX, RUNTIME_SUGGESTION_TEXT, generateDevSelfDenialModule, generateSelfContainedMockModule, loadMarkerModule, loadMockEdgeModule, loadMockRuntimeModule, loadSilentMockModule, makeMockEdgeModuleId, mockRuntimeModuleIdFromViolation } from '../../import-protection/virtualModules.js';
export declare function resolvedMarkerVirtualModuleId(kind: 'server' | 'client'): string;
export declare function getResolvedVirtualModuleMatchers(): ReadonlyArray<string>;
export declare function resolveInternalVirtualModuleId(source: string): string | undefined;
export declare function loadResolvedVirtualModule(id: string): {
    code: string;
} | undefined;
export { MARKER_PREFIX, MOCK_BUILD_PREFIX, MOCK_EDGE_PREFIX, MOCK_MODULE_ID, MOCK_RUNTIME_PREFIX, RUNTIME_SUGGESTION_TEXT, generateDevSelfDenialModule, generateSelfContainedMockModule, loadMarkerModule, loadMockEdgeModule, loadMockRuntimeModule, loadSilentMockModule, makeMockEdgeModuleId, mockRuntimeModuleIdFromViolation, };
