import { FileMatchers } from '../import-protection/utils.js';
import { CompileStartFrameworkOptions, GetConfigFn } from '../types.js';
import { RsbuildPluginAPI } from '@rsbuild/core';
type ResolvedImportProtectionCheck = {
    type: 'file';
    fileMatch: FileMatchers['files'][number];
} | {
    type: 'marker';
};
export declare function getRsbuildResolvedImportProtectionCheck(relativeResolved: string, matchers: FileMatchers): ResolvedImportProtectionCheck | undefined;
export declare function registerImportProtection(api: RsbuildPluginAPI, opts: {
    getConfig: GetConfigFn;
    framework: CompileStartFrameworkOptions;
    environments: Array<{
        name: string;
        type: 'client' | 'server';
    }>;
}): void;
export {};
