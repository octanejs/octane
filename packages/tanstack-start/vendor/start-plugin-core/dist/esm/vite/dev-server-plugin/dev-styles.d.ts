import { ViteDevServer } from 'vite';
export declare const CSS_MODULES_REGEX: RegExp;
export declare function normalizeCssModuleCacheKey(idOrFile: string): string;
export declare function isCssModulesFile(file: string): boolean;
export interface CollectDevStylesOptions {
    viteDevServer: ViteDevServer;
    entries: Array<string>;
    /** Cache of CSS modules content captured during transform hook */
    cssModulesCache?: Record<string, string>;
}
/**
 * Collect CSS content from the module graph starting from the given entry points.
 */
export declare function collectDevStyles(opts: CollectDevStylesOptions): Promise<string | undefined>;
/**
 * Extract CSS content from Vite's transformed CSS module code.
 *
 * Vite embeds CSS into the module as a JS string via `JSON.stringify(cssContent)`,
 * e.g. `const __vite__css = ${JSON.stringify('...css...')}`.
 *
 * We locate that JSON string literal and run `JSON.parse` on it to reverse the
 * escaping (\\n, \\t, \\", \\\\, \\uXXXX, etc.).
 */
export declare function extractCssFromCode(code: string): string | undefined;
