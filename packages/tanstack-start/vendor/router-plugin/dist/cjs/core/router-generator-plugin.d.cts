import { UnpluginFactory } from 'unplugin';
import { Config } from './config.cjs';
import { RouterPluginContext } from './router-plugin-context.cjs';
export declare function createRouterGeneratorPlugin(options: Partial<Config | (() => Config)> | undefined, routerPluginContext: RouterPluginContext): ReturnType<UnpluginFactory<Partial<Config | (() => Config)> | undefined>>;
export declare const unpluginRouterGeneratorFactory: UnpluginFactory<Partial<Config | (() => Config)> | undefined>;
