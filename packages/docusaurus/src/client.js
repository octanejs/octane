import { createElement } from 'octane';
import { createBrowserRouter, createMemoryRouter } from '@octanejs/remix-router';
import {
	DocusaurusRouteRenderer,
	DocusaurusRouterProvider,
	useDocusaurusManifest,
	useDocusaurusRouteContext,
} from './client-components.tsrx';
import { docusaurusModuleKey } from './route-modules.js';

export { DocusaurusRouterProvider, useDocusaurusManifest, useDocusaurusRouteContext };

function isImportedModule(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		value.__import === true &&
		typeof value.path === 'string'
	);
}

function moduleValue(module) {
	if (
		module === null ||
		typeof module !== 'object' ||
		!Object.prototype.hasOwnProperty.call(module, 'default')
	) {
		return module;
	}
	const value = module.default;
	if (typeof value === 'function' || (value !== null && typeof value === 'object')) {
		for (const [name, exported] of Object.entries(module)) {
			if (name !== 'default') value[name] = exported;
		}
	}
	return value;
}

async function loadModule(reference, registry, cache) {
	const key = docusaurusModuleKey(reference);
	const importer = registry[key];
	if (typeof importer !== 'function') {
		throw new Error(
			`[@octanejs/docusaurus] No client route importer was generated for ${JSON.stringify(key)}.`,
		);
	}
	let pending = cache.get(key);
	if (pending === undefined) {
		pending = Promise.resolve().then(importer);
		cache.set(key, pending);
		pending.catch(() => {
			if (cache.get(key) === pending) cache.delete(key);
		});
	}
	return moduleValue(await pending);
}

async function loadRouteModules(value, registry, cache) {
	if (typeof value === 'string' || isImportedModule(value)) {
		return loadModule(value, registry, cache);
	}
	if (Array.isArray(value)) {
		return Promise.all(value.map((item) => loadRouteModules(item, registry, cache)));
	}
	if (value !== null && typeof value === 'object') {
		const entries = await Promise.all(
			Object.entries(value).map(async ([name, item]) => [
				name,
				await loadRouteModules(item, registry, cache),
			]),
		);
		return Object.fromEntries(entries);
	}
	return value;
}

function routePath(route) {
	if (
		route.path === '*' ||
		route.exact === true ||
		(route.children !== undefined && route.children.length > 0)
	) {
		return route.path;
	}
	return route.path.endsWith('/') ? `${route.path}*` : `${route.path}/*`;
}

function createRouteComponent(route, Component, modules, context) {
	return function DocusaurusResolvedRoute() {
		return createElement(DocusaurusRouteRenderer, {
			Component,
			context,
			modules,
			route,
		});
	};
}

function createRoute(route, registry, cache) {
	return {
		id: route.id,
		path: routePath(route),
		handle: {
			docusaurus: route,
		},
		async lazy() {
			const [Component, modules, context] = await Promise.all([
				loadModule(route.component, registry, cache),
				loadRouteModules(route.modules ?? {}, registry, cache),
				loadRouteModules(route.context ?? {}, registry, cache),
			]);
			if (typeof Component !== 'function') {
				throw new TypeError(
					`[@octanejs/docusaurus] Route ${JSON.stringify(route.path)} component ` +
						`${JSON.stringify(docusaurusModuleKey(route.component))} has no default component export.`,
				);
			}
			return {
				Component: createRouteComponent(route, Component, modules, context),
			};
		},
		children: (route.children ?? []).map((child) => createRoute(child, registry, cache)),
	};
}

export function createDocusaurusRoutes(manifest, registry) {
	const cache = new Map();
	return manifest.routes.map((route) => createRoute(route, registry, cache));
}

export function createDocusaurusBrowserRouter(manifest, registry, options) {
	return createBrowserRouter(createDocusaurusRoutes(manifest, registry), options);
}

export function createDocusaurusMemoryRouter(manifest, registry, options) {
	return createMemoryRouter(createDocusaurusRoutes(manifest, registry), options);
}
