import { UnpluginFactory } from 'unplugin';
import { Config } from './config.js';
import { RouterPluginContext } from './router-plugin-context.js';
/**
 * This plugin adds HMR support for file routes.
 * It is only added to the composed plugin in dev when autoCodeSplitting is disabled, since the code splitting plugin
 * handles HMR for code-split routes itself.
 */
export declare function createRouterHmrPlugin(options: Partial<Config | (() => Config)> | undefined, routerPluginContext: RouterPluginContext): ReturnType<UnpluginFactory<Partial<Config> | undefined>>;
export declare const unpluginRouterHmrFactory: UnpluginFactory<Partial<Config> | undefined>;
