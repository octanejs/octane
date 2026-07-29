/// <reference path="./virtual.d.ts" />

import type { ComponentBody, OctaneNode } from 'octane';
import type {
	DOMRouterOpts,
	DataRouter,
	Location,
	MemoryRouterOpts,
	NavigateFunction,
	RouteObject,
} from '@octanejs/remix-router';
import type {
	DocusaurusManifest,
	DocusaurusManifestRoute,
	DocusaurusPluginIdentifier,
} from './index.js';

export type DocusaurusRouteModuleNamespace = Record<string, unknown>;
export type DocusaurusRouteModuleImporter = () => Promise<DocusaurusRouteModuleNamespace>;
export type DocusaurusRouteModuleRegistry = Record<string, DocusaurusRouteModuleImporter>;

export interface DocusaurusRouteContext {
	plugin: DocusaurusPluginIdentifier;
	data: Record<string, unknown>;
}

export interface DocusaurusRouteComponentProps extends Record<string, unknown> {
	route: DocusaurusManifestRoute & { routes: DocusaurusManifestRoute[] };
	location: Location;
	params: Readonly<Record<string, string | undefined>>;
	navigate: NavigateFunction;
	children?: OctaneNode;
}

export declare function createDocusaurusRoutes(
	manifest: DocusaurusManifest,
	registry: DocusaurusRouteModuleRegistry,
): RouteObject[];

export declare function createDocusaurusBrowserRouter(
	manifest: DocusaurusManifest,
	registry: DocusaurusRouteModuleRegistry,
	options?: DOMRouterOpts,
): DataRouter;

export declare function createDocusaurusMemoryRouter(
	manifest: DocusaurusManifest,
	registry: DocusaurusRouteModuleRegistry,
	options?: MemoryRouterOpts,
): DataRouter;

export declare const DocusaurusRouterProvider: ComponentBody<{
	manifest: DocusaurusManifest;
	router: DataRouter;
}>;

export declare function useDocusaurusManifest(): DocusaurusManifest;
export declare function useDocusaurusRouteContext(): DocusaurusRouteContext;
