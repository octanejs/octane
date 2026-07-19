import { PluginOption } from 'vite';
import { GetConfigFn } from '../../types.js';
export declare function devServerPlugin({ getConfig: _getConfig, devSsrStylesEnabled, installDevServerMiddleware, }: {
    getConfig: GetConfigFn;
    devSsrStylesEnabled: boolean;
    installDevServerMiddleware: boolean | undefined;
}): PluginOption;
