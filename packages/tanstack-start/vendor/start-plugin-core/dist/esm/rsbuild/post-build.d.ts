import { TanStackStartOutputConfig } from '../schema.js';
export declare function postBuildWithRsbuild({ startConfig, clientOutputDirectory, serverOutputDirectory, }: {
    startConfig: TanStackStartOutputConfig;
    clientOutputDirectory: string;
    serverOutputDirectory: string;
}): Promise<void>;
