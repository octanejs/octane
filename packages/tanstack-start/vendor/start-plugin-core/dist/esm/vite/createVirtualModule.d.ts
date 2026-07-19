import { Plugin } from 'vite';
type VirtualModuleLoadHandler = (this: any, id: string) => string | null | undefined | Promise<string | null | undefined>;
export declare function createVirtualModule(opts: {
    name: string;
    moduleId: string;
    load: VirtualModuleLoadHandler;
    apply?: Plugin['apply'];
    applyToEnvironment?: Plugin['applyToEnvironment'];
    enforce?: Plugin['enforce'];
    sharedDuringBuild?: boolean;
}): Plugin;
export {};
