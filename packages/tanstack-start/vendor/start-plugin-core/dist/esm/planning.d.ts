import { TanStackStartOutputConfig } from './schema.js';
import { NormalizedBasePaths, NormalizedOutputDirectories, TanStackStartCoreOptions } from './types.js';
export interface ResolvedStartEntryPlan {
    srcDirectory: string;
    startFilePath: string | undefined;
    routerFilePath: string;
    entryPaths: {
        client: string;
        server: string;
        start: string;
        router: string;
    };
}
export declare function normalizePublicBase(base: string | undefined): string;
export declare function deriveRouterBasepath(opts: {
    configuredBasepath: string | undefined;
    publicBase: string;
}): string;
export declare function shouldRewriteDevBasepath(opts: {
    command: 'serve' | 'build';
    middlewareMode: boolean | undefined;
    routerBasepath: string;
    publicBase: string;
}): boolean;
export declare function createNormalizedBasePaths(opts: {
    publicBase: string;
}): NormalizedBasePaths;
export declare function createNormalizedOutputDirectories(opts: {
    client: string;
    server: string;
}): NormalizedOutputDirectories;
export declare function createServerFnBasePath(opts: {
    routerBasepath: string;
    serverFnBase: string;
}): string;
export declare function resolveStartEntryPlan(opts: {
    root: string;
    startConfig: TanStackStartOutputConfig;
    defaultEntryPaths: TanStackStartCoreOptions['defaultEntryPaths'];
}): ResolvedStartEntryPlan;
