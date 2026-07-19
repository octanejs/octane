import { RsbuildPluginAPI, rspack as rspackNamespaceType } from '@rsbuild/core';
import { GetConfigFn, NormalizedClientBuild, SerializationAdapterConfig } from '../types.js';
import { ServerFn } from '../start-compiler/types.js';
import { ScriptFormat } from '@tanstack/router-core';
type RspackNamespace = typeof rspackNamespaceType;
type RspackVirtualModulesPlugin = InstanceType<RspackNamespace['experiments']['VirtualModulesPlugin']>;
export declare const START_MANIFEST_PLACEHOLDER = "__TSS_START_MANIFEST_PLACEHOLDER__";
export interface VirtualModuleState {
    /** Call to update manifest content after client build completes */
    updateManifest: (clientBuild: NormalizedClientBuild) => void;
    /** Call to update server fn resolver content after compilation discovers fns */
    updateServerFnResolver: () => void;
    /** Try to write explicit resolver content now; queues if env not ready */
    tryUpdateServerFnResolver: (content: string) => void;
    /** Get the virtual path for a given module ID */
    getVirtualPath: (moduleId: string) => string;
    /** Generate resolver module content from current serverFnsById state.
     *  When forProvider=true, generates without isClientReferenced checks (RSC layer). */
    generateCurrentResolverContent: (forProvider?: boolean) => string;
    /** The absolute virtual path of the server fn resolver module */
    serverFnResolverPath: string;
    /** The absolute virtual path of the manifest module */
    manifestPath: string;
    /** Generate manifest module content from a given client build */
    generateManifestContent: (clientBuild: NormalizedClientBuild) => string;
    /** Generate the serialized manifest value literal for asset patching */
    generateManifestValueLiteral: (clientBuild: NormalizedClientBuild) => string;
    /** VirtualModulesPlugin instances keyed by environment name */
    vmPlugins: Record<string, RspackVirtualModulesPlugin>;
}
export interface RegisterVirtualModulesOptions {
    root: string;
    getConfig: GetConfigFn;
    serverFnsById: Record<string, ServerFn>;
    providerEnvName: string;
    ssrIsProvider: boolean;
    serializationAdapters: Array<SerializationAdapterConfig> | undefined;
    /**
     * Get the URL at which the rsbuild dev server serves the client entry JS.
     * Called lazily inside modifyRspackConfig when getConfig() is available.
     * Example return: '/assets/js/index.js'
     */
    getDevClientEntryUrl: (publicBase: string) => string;
    /** Whether RSC virtual modules should be registered. */
    rscEnabled?: boolean | undefined;
    scriptFormat: ScriptFormat;
}
/**
 * Registers virtual modules for the rsbuild adapter using VirtualModulesPlugin.
 *
 * Creates one VirtualModulesPlugin per environment and registers them via
 * `modifyBundlerChain`. Provides update functions to refresh content dynamically.
 */
export declare function registerVirtualModules(api: RsbuildPluginAPI, opts: RegisterVirtualModulesOptions): VirtualModuleState;
export {};
