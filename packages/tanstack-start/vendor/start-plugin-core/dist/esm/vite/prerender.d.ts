import { TanStackStartOutputConfig } from '../schema.js';
import { ViteBuilder } from 'vite';
export declare function prerenderWithVite({ startConfig, builder, }: {
    startConfig: TanStackStartOutputConfig;
    builder: ViteBuilder;
}): Promise<void>;
