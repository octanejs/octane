import type { RenderOptions, RenderResult } from 'octane/static';
import type { StaticHandler, StaticHandlerContext } from '@octanejs/remix-router';
import type { DocusaurusManifest } from './index.js';
import type { DocusaurusRouteModuleRegistry } from './client.js';

export interface DocusaurusPrerenderOptions extends RenderOptions {
	basename?: string;
	requestContext?: unknown;
}

export interface DocusaurusLinkAsset {
	href: string;
	integrity?: string;
	crossOrigin?: 'anonymous' | 'use-credentials';
	referrerPolicy?: string;
	media?: string;
}

export interface DocusaurusScriptAsset {
	src: string;
	type?: string;
	async?: boolean;
	defer?: boolean;
	integrity?: string;
	crossOrigin?: 'anonymous' | 'use-credentials';
	referrerPolicy?: string;
}

export interface DocusaurusDocumentAssets {
	stylesheets?: Array<string | DocusaurusLinkAsset>;
	modulePreloads?: Array<string | DocusaurusLinkAsset>;
	scripts?: Array<string | DocusaurusScriptAsset>;
}

export interface DocusaurusDocumentOptions {
	rootId?: string;
	nonce?: string;
	htmlAttributes?: Record<string, string | boolean | null | undefined>;
	bodyAttributes?: Record<string, string | boolean | null | undefined>;
	assets?: DocusaurusDocumentAssets;
	hydrate?: string | DocusaurusScriptAsset;
}

export interface DocusaurusDocumentPrerenderOptions extends DocusaurusPrerenderOptions {
	document?: DocusaurusDocumentOptions;
}

export interface DocusaurusPrerenderResult extends RenderResult {
	context: StaticHandlerContext;
}

export interface DocusaurusDocumentPrerenderResult extends DocusaurusPrerenderResult {
	bodyHtml: string;
}

export declare function createDocusaurusStaticHandler(
	manifest: DocusaurusManifest,
	registry: DocusaurusRouteModuleRegistry,
	options?: { basename?: string },
): StaticHandler;

export declare function prerenderDocusaurusRoute(
	request: Request | string | URL,
	manifest: DocusaurusManifest,
	registry: DocusaurusRouteModuleRegistry,
	options?: DocusaurusPrerenderOptions,
): Promise<DocusaurusPrerenderResult | Response>;

export declare function renderDocusaurusDocument(
	rendered: RenderResult,
	manifest: DocusaurusManifest,
	options?: DocusaurusDocumentOptions,
): string;

export declare function prerenderDocusaurusDocument(
	request: Request | string | URL,
	manifest: DocusaurusManifest,
	registry: DocusaurusRouteModuleRegistry,
	options?: DocusaurusDocumentPrerenderOptions,
): Promise<DocusaurusDocumentPrerenderResult | Response>;
