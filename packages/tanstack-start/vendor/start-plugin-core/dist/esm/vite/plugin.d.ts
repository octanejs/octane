import { TanStackStartVitePluginCoreOptions } from './types.js';
import { TanStackStartViteInputConfig } from './schema.js';
import { PluginOption } from 'vite';
export declare function tanStackStartVite(corePluginOpts: TanStackStartVitePluginCoreOptions, startPluginOpts: TanStackStartViteInputConfig | undefined): Array<PluginOption>;
