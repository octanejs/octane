import { SerializationAdapterConfig } from '../types.js';
import { PluginOption } from 'vite';
export declare function serializationAdaptersPlugin(opts: {
    adapters: Array<SerializationAdapterConfig> | undefined;
}): PluginOption;
