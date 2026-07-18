import { TanStackStartOutputConfig } from './schema.js';
export interface StartPostBuildAdapter {
    getClientOutputDirectory: () => string;
    prerender: (startConfig: TanStackStartOutputConfig) => Promise<void>;
}
export declare function postBuild({ startConfig, adapter, }: {
    startConfig: TanStackStartOutputConfig;
    adapter: StartPostBuildAdapter;
}): Promise<void>;
