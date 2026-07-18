import { GetConfigFn } from '../../types.js';
import { TanStackStartVitePluginCoreOptions } from '../types.js';
import { PluginOption } from 'vite';
import { TanStackStartInputConfig } from '../../schema.js';
export declare function tanStackStartRouter(startPluginOpts: TanStackStartInputConfig, getConfig: GetConfigFn, corePluginOpts: TanStackStartVitePluginCoreOptions): Array<PluginOption>;
