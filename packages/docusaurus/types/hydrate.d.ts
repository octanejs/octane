import type { Root } from 'octane';
import type { DataRouter, DOMRouterOpts } from '@octanejs/remix-router';
import type { DocusaurusManifest } from './index.js';
import type { DocusaurusRouteModuleRegistry } from './client.js';

export interface DocusaurusHydrateOptions extends DOMRouterOpts {
	identifierPrefix?: string;
	signal?: AbortSignal;
}

export interface DocusaurusHydrationRoot {
	root: Root;
	router: DataRouter;
}

export declare function hydrateDocusaurusRoot(
	container: Element,
	manifest: DocusaurusManifest,
	registry: DocusaurusRouteModuleRegistry,
	options?: DocusaurusHydrateOptions,
): Promise<DocusaurusHydrationRoot>;
