import { GetConfigFn } from '../../types.js';
import { PluginOption } from 'vite';
export declare function startManifestPlugin(opts: {
    getConfig: GetConfigFn;
}): PluginOption;
