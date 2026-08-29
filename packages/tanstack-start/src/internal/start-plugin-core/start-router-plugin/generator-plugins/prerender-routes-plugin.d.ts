import { GeneratorPlugin } from '@octanejs/tanstack-router/router-generator';
/**
 * this plugin gets the prerenderable paths and stores it on globalThis
 * so that it can be accessed later (e.g. from a vite plugin)
 */
export declare function prerenderRoutesPlugin(): GeneratorPlugin;
