import type { RenderOptions, RenderResult } from 'octane/static';
import type { StaticHandler, StaticHandlerContext } from '@octanejs/remix-router';
import type { DocusaurusManifest } from './index.js';
import type { DocusaurusRouteModuleRegistry } from './client.js';

export interface DocusaurusPrerenderOptions extends RenderOptions {
	basename?: string;
	requestContext?: unknown;
}

export interface DocusaurusPrerenderResult extends RenderResult {
	context: StaticHandlerContext;
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
