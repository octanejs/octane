import { Config } from './config.cjs';
import { RouterPluginContext } from './router-plugin-context.cjs';
import { UnpluginFactory } from 'unplugin';
export declare function createRouterCodeSplitterPlugin(options: Partial<Config | (() => Config)> | undefined, routerPluginContext: RouterPluginContext): ReturnType<UnpluginFactory<Partial<Config | (() => Config)> | undefined>>;
export declare const unpluginRouterCodeSplitterFactory: UnpluginFactory<Partial<Config | (() => Config)> | undefined>;
