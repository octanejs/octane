import { createBrowserRouter, createMemoryRouter } from '@octanejs/remix-router';
import {
	DocusaurusRouterProvider,
	useDocusaurusManifest,
	useDocusaurusRouteContext,
} from './client-components.tsrx';
import { createDocusaurusRoutes } from './routes.js';

export { DocusaurusRouterProvider, useDocusaurusManifest, useDocusaurusRouteContext };
export { createDocusaurusRoutes };

export function createDocusaurusBrowserRouter(manifest, registry, options) {
	return createBrowserRouter(createDocusaurusRoutes(manifest, registry), options);
}

export function createDocusaurusMemoryRouter(manifest, registry, options) {
	return createMemoryRouter(createDocusaurusRoutes(manifest, registry), options);
}
