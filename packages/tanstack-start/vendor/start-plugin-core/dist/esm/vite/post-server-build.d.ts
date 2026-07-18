import { TanStackStartOutputConfig } from '../schema.js';
import { ViteBuilder } from 'vite';
export declare function postServerBuild({ builder, startConfig, }: {
    builder: ViteBuilder;
    startConfig: TanStackStartOutputConfig;
}): Promise<void>;
