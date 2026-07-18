import { CompiledMatcher } from './matchers.js';
export type ImportProtectionEnvType = 'client' | 'server';
export interface ImportProtectionEnvRules {
    specifiers: Array<CompiledMatcher>;
    files: Array<CompiledMatcher>;
    excludeFiles: Array<CompiledMatcher>;
}
/**
 * Shared subset of adapter config used to decide which environment rules apply
 * and whether an importer should be checked at all.
 */
export interface ImportProtectionAdapterConfig {
    root: string;
    srcDirectory: string;
    compiledRules: {
        client: ImportProtectionEnvRules;
        server: ImportProtectionEnvRules;
    };
    includeMatchers: Array<CompiledMatcher>;
    excludeMatchers: Array<CompiledMatcher>;
    ignoreImporterMatchers: Array<CompiledMatcher>;
    envTypeMap: Map<string, ImportProtectionEnvType>;
}
export declare function getImportProtectionRelativePath(root: string, absolutePath: string): string;
export declare function getImportProtectionEnvType(config: Pick<ImportProtectionAdapterConfig, 'envTypeMap'>, envName: string): ImportProtectionEnvType;
export declare function getImportProtectionRulesForEnvironment(config: Pick<ImportProtectionAdapterConfig, 'compiledRules' | 'envTypeMap'>, envName: string): ImportProtectionEnvRules;
export declare function shouldCheckImportProtectionImporter(config: Pick<ImportProtectionAdapterConfig, 'root' | 'srcDirectory' | 'includeMatchers' | 'excludeMatchers' | 'ignoreImporterMatchers'>, importer: string, cache?: Map<string, boolean>): boolean;
