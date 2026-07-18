import { Config } from './config.cjs';
import { UnpluginFactory } from 'unplugin';
export declare const unpluginRouterComposedFactory: UnpluginFactory<Partial<Config | (() => Config)> | undefined>;
