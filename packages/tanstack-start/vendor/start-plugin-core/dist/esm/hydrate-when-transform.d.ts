import { StartCompilerPlugin } from './types.js';
export declare class MissingHydrateSourceError extends Error {
    constructor(id: string);
}
export declare function createHydrateCompilerPlugin(): StartCompilerPlugin;
