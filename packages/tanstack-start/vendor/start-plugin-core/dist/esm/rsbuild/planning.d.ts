import { ENTRY_POINTS } from '../constants.js';
import { EnvironmentConfig } from '@rsbuild/core';
import { ResolvedStartEntryPlan } from '../planning.js';
import { RsbuildEnvironmentOverrides } from './types.js';
import { ScriptFormat } from '@tanstack/router-core';
export declare const RSBUILD_ENVIRONMENT_NAMES: {
    readonly client: "client";
    readonly server: "ssr";
};
/**
 * Rspack layer names for the rsbuild RSC layered model.
 * These match the canonical names from `rspack.experiments.rsc.Layers`.
 */
export declare const RSBUILD_RSC_LAYERS: {
    /** React Server Components layer — uses `react-server` resolve condition */
    readonly rsc: "react-server-components";
    /** Server-Side Rendering layer — standard Node resolve */
    readonly ssr: "server-side-rendering";
};
export declare const RSBUILD_CLIENT_ASSETS_DIR = "assets";
export type RsbuildEnvironmentName = (typeof RSBUILD_ENVIRONMENT_NAMES)[keyof typeof RSBUILD_ENVIRONMENT_NAMES];
type RsbuildDistPath = NonNullable<EnvironmentConfig['output']>['distPath'];
export interface RsbuildResolvedEntryAliases {
    client: string;
    server: string;
    start: string;
    router: string;
    alias: Record<(typeof ENTRY_POINTS)[keyof typeof ENTRY_POINTS], string>;
}
export declare function createRsbuildResolvedEntryAliases(opts: {
    entryPaths: ResolvedStartEntryPlan['entryPaths'];
}): RsbuildResolvedEntryAliases;
export interface RsbuildEnvironmentPlanResult {
    environments: Record<string, EnvironmentConfig>;
    alias: Record<string, string>;
}
export declare function createRsbuildEnvironmentPlan(opts: {
    root: string;
    entryAliases: RsbuildResolvedEntryAliases;
    clientOutputDirectory: string;
    serverOutputDirectory: string;
    publicBase: string;
    serverFnProviderEnv: string;
    environmentOverrides?: RsbuildEnvironmentOverrides;
    scriptFormat?: ScriptFormat;
    rsc?: boolean | undefined;
    dev?: boolean | undefined;
}): RsbuildEnvironmentPlanResult;
export declare function resolveRsbuildOutputDirectory(opts: {
    distPath: RsbuildDistPath | undefined;
    rootDistPath: RsbuildDistPath | undefined;
    fallback: string;
    subdirectory: string;
}): string;
export {};
