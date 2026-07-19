import { MARKER_PREFIX, MOCK_BUILD_PREFIX, MOCK_EDGE_PREFIX, MOCK_MODULE_ID, MOCK_RUNTIME_PREFIX } from './constants.js';
import { ViolationInfo } from './trace.js';
type MockAccessMode = 'error' | 'warn' | 'off';
export declare const RUNTIME_SUGGESTION_TEXT: string;
export declare function mockRuntimeModuleIdFromViolation(info: ViolationInfo, mode: MockAccessMode, root: string): string;
export declare function makeMockEdgeModuleId(exports: Array<string>, runtimeId: string): string;
export declare function loadSilentMockModule(): {
    code: string;
};
export declare function generateSelfContainedMockModule(exportNames: Array<string>): {
    code: string;
};
export declare function generateDevSelfDenialModule(exportNames: Array<string>, runtimeId: string): {
    code: string;
};
export declare function loadMockEdgeModule(encodedPayload: string): {
    code: string;
};
export declare function loadMockRuntimeModule(encodedPayload: string): {
    code: string;
};
export declare function loadMarkerModule(): {
    code: string;
};
export { MARKER_PREFIX, MOCK_BUILD_PREFIX, MOCK_EDGE_PREFIX, MOCK_MODULE_ID, MOCK_RUNTIME_PREFIX, };
