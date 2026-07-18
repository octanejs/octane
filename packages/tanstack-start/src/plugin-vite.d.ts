import type { tanstackStart as vendoredTanstackStart } from '@tanstack/octane-start/plugin/vite';

export * from '@tanstack/octane-start/plugin/vite';

/**
 * The vendored `tanstackStart()` plus the binding's workspace-source
 * optimizeDeps excludes (see plugin-vite.js). Same signature and plugin
 * array shape as upstream.
 */
export declare const tanstackStart: typeof vendoredTanstackStart;
