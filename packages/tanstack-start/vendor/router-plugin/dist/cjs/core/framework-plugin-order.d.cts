import { Config } from './config.cjs';
export declare function validateFrameworkPluginOrder(opts: {
    framework: Config['target'];
    plugins: ReadonlyArray<{
        name: string;
    }>;
    routerPluginName: string;
}): void;
