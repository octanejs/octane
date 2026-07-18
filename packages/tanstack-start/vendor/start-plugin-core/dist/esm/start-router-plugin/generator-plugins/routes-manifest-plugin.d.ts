import { GeneratorPlugin } from '@tanstack/router-generator';
/**
 * this plugin builds the routes manifest and stores it on globalThis
 * so that it can be accessed later (e.g. from a vite plugin)
 */
export declare function routesManifestPlugin(): GeneratorPlugin;
