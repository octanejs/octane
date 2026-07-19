import { RsbuildConfig } from '@rsbuild/core';
type ServerSetupFn = Extract<NonNullable<NonNullable<RsbuildConfig['server']>['setup']>, (...args: Array<any>) => any>;
/**
 * Returns a `server.setup` function for rsbuild v2.
 *
 * Two middleware positions are used:
 *
 * 1. **Setup body** (BEFORE built-ins): Intercepts `/_serverFn/` URLs so
 *    they never reach rsbuild's htmlFallback/htmlCompletion middleware,
 *    which can swallow long base64 function IDs.
 *
 * 2. **Returned callback** (AFTER built-ins, BEFORE fallback): Handles
 *    all remaining SSR requests (page navigations). This position lets
 *    rsbuild's asset middleware serve compiled JS/CSS first.
 *
 * The middleware choreography is shared by dev and preview. The server entry
 * loader differs: dev reads from Rsbuild's in-memory environment so rebuilds
 * are reflected immediately, while preview lazy-imports the production server
 * bundle from disk.
 *
 * See rsbuild source: devMiddlewares.ts `applyDefaultMiddlewares()` and
 * previewServer.ts `startPreviewServer()`.
 */
export declare function createServerSetup(opts: {
    serverFnBasePath: string;
    serverOutputDirectory: string;
    publicBase: string;
}): ServerSetupFn;
export {};
