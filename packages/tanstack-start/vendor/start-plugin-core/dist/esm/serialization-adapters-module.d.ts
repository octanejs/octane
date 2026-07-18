import { SerializationAdapterConfig } from './types.js';
export declare const EMPTY_SERIALIZATION_ADAPTERS_MODULE = "export const pluginSerializationAdapters = []\nexport const hasPluginAdapters = false";
interface ResolvedAdapterModule {
    module: string;
    export: string;
    isFactory: boolean;
    index: number;
}
export declare function resolveSerializationAdaptersForRuntime(opts: {
    adapters: Array<SerializationAdapterConfig> | undefined;
    runtime: 'client' | 'server';
}): Array<ResolvedAdapterModule>;
export declare function generateSerializationAdaptersModule(opts: {
    adapters: Array<SerializationAdapterConfig> | undefined;
    runtime: 'client' | 'server';
}): string;
export {};
