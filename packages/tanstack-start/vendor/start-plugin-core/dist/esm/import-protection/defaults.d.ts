import { ImportProtectionEnvRules } from '../schema.js';
export interface DefaultImportProtectionRules {
    client: Required<ImportProtectionEnvRules>;
    server: Required<ImportProtectionEnvRules>;
}
/**
 * Returns the default import protection rules.
 *
 * All framework variants are always included so that, e.g., a React
 * project also denies `@tanstack/solid-start/server` imports.
 */
export declare function getDefaultImportProtectionRules(): DefaultImportProtectionRules;
/**
 * Marker module specifiers that restrict a file to a specific environment.
 */
export declare function getMarkerSpecifiers(): {
    serverOnly: Array<string>;
    clientOnly: Array<string>;
};
