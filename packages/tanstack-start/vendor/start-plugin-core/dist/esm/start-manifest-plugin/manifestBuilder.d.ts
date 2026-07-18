import { ManifestCssLink, ManifestScript, ScriptFormat } from '@tanstack/router-core';
import { InlineCssTemplate } from './inlineCss.js';
import { NormalizedClientBuild, NormalizedClientChunk } from '../types.js';
type RouteTreeRoute = {
    filePath?: string;
    preloads?: Array<string>;
    scripts?: Array<ManifestScript>;
    css?: Array<ManifestCssLink>;
    children?: Array<string>;
};
type RouteTreeRoutes = Record<string, RouteTreeRoute>;
type AdditionalRouteManifestEntry = ManifestCssLink | ManifestScript;
interface ScannedClientChunks {
    entryChunk: NormalizedClientChunk;
    chunksByFileName: ReadonlyMap<string, NormalizedClientChunk>;
    routeChunksByFilePath: ReadonlyMap<string, Array<NormalizedClientChunk>>;
}
interface ManifestAssetResolvers {
    getAssetPath: (fileName: string) => string;
    getChunkPreloads: (chunk: NormalizedClientChunk) => Array<string>;
    getStylesheetLink: (cssFile: string) => ManifestCssLink;
}
export interface StartManifest {
    scriptFormat?: ScriptFormat;
    routes: Record<string, RouteTreeRoute>;
    inlineCss?: {
        styles: Record<string, string>;
        templates?: Record<string, InlineCssTemplate>;
    };
}
export interface InlineCssOptions {
    enabled: boolean;
    transformAssets: boolean;
}
export declare function appendUniqueStrings(target: Array<string> | undefined, source: Array<string>): string[] | undefined;
export declare function buildStartManifest(options: {
    clientBuild: NormalizedClientBuild;
    routeTreeRoutes: RouteTreeRoutes;
    basePath: string;
    inlineCss?: InlineCssOptions;
    scriptFormat?: ScriptFormat;
    additionalRouteAssets?: Partial<Record<string, ReadonlyArray<AdditionalRouteManifestEntry>>>;
}): StartManifest;
export declare function serializeStartManifest(startManifest: StartManifest): string;
export declare function scanClientChunks(clientBuild: NormalizedClientBuild): ScannedClientChunks;
export declare function createManifestAssetResolvers(basePath: string): ManifestAssetResolvers;
export declare function createChunkCssAssetCollector(options: {
    chunksByFileName: ReadonlyMap<string, NormalizedClientChunk>;
    getStylesheetLink: (cssFile: string) => ManifestCssLink;
}): {
    getChunkCssAssets: (chunk: NormalizedClientChunk) => Array<ManifestCssLink>;
};
export declare function buildRouteManifestRoutes(options: {
    routeTreeRoutes: RouteTreeRoutes;
    routeChunksByFilePath: ReadonlyMap<string, ReadonlyArray<NormalizedClientChunk>>;
    chunksByFileName: ReadonlyMap<string, NormalizedClientChunk>;
    entryChunk: NormalizedClientChunk;
    assetResolvers: ManifestAssetResolvers;
    additionalRouteAssets?: Partial<Record<string, ReadonlyArray<AdditionalRouteManifestEntry>>>;
}): Record<string, RouteTreeRoute>;
export {};
