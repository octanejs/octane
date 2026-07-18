export interface InlineCssTemplate {
    strings: Array<string>;
    urls: Array<string>;
}
export interface InlineCssResult {
    css: string;
    template?: InlineCssTemplate;
}
export declare function shouldRebaseInlineCssUrls(css: string): boolean;
export declare function rebaseInlineCssUrls(options: {
    css: string;
    cssHref: string;
}): string;
export declare function processInlineCssUrls(options: {
    css: string;
    cssHref: string;
    templates?: boolean;
}): InlineCssResult;
export declare function getCssAssetSource(source: unknown): string | undefined;
