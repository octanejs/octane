import { Page, TanStackStartOutputConfig } from './schema.js';
export interface PrerenderHandler {
    getClientOutputDirectory: () => string;
    request: (path: string, options?: RequestInit) => Promise<Response>;
    close?: () => Promise<void>;
}
export declare function prerender({ startConfig, handler, }: {
    startConfig: TanStackStartOutputConfig;
    handler: PrerenderHandler;
}): Promise<void>;
export declare function validateAndNormalizePrerenderPages(pages: Array<Page>, routerBaseUrl: URL): Array<Page>;
