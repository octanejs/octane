import { Rollup } from 'vite';
import { NormalizedClientBuild, NormalizedClientChunk } from '../../types.js';
export declare function normalizeViteClientChunk(chunk: Rollup.OutputChunk): NormalizedClientChunk;
export declare function normalizeViteClientChunks(clientBundle: Rollup.OutputBundle): ReadonlyMap<string, NormalizedClientChunk>;
export declare function normalizeViteClientBuild(clientBundle: Rollup.OutputBundle): NormalizedClientBuild;
export declare function getRouteFilePathsFromModuleIds(moduleIds: Array<string>): string[];
export declare function getHydrationIdsFromModuleIds(moduleIds: Array<string>): string[];
