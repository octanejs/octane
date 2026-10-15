'use strong';

import { BaseRoute, BaseRootRoute, BaseRouteApi, notFound } from '@tanstack/router-core';
import { createRouteHookBindings } from '../routeHookBindings';
import * as hooks from './bindings';
import { Link } from './Link.tsrx';
import { splitSlot, subSlot } from '../internal';
import type * as RouteFactories from '../route';
import type * as FileFactories from '../fileRoute';

const { attachRouteHooks, attachRouteNavigation, attachLazyRouteHooks } = createRouteHookBindings(
	hooks,
	hooks.useRouter,
);

function attachRoute(route: any) {
	attachRouteHooks(route, true);
	attachRouteNavigation(route);
	function RouteLink(props: any) @{
		<Link from={route.fullPath} {...props} />
	}
	route.Link = RouteLink;
	return route;
}

// These factories preserve the binding's precise route types, while constructing
// core instances directly: no ordinary-context hooks or descriptor Link are made.
export const createRoute: typeof RouteFactories.createRoute = (options: any) =>
	attachRoute(new BaseRoute(options));
export const createRootRoute: typeof RouteFactories.createRootRoute = (options?: any) =>
	attachRoute(new BaseRootRoute(options));
export const createRootRouteWithContext: typeof RouteFactories.createRootRouteWithContext = () =>
	createRootRoute;
export const rootRouteWithContext = createRootRouteWithContext;

export const getRouteApi: typeof RouteFactories.getRouteApi = (id: any) => {
	const route = new BaseRouteApi({ id }) as any;
	attachRouteHooks(route, false);
	route.useNavigate = (...args: any[]) => {
		const [, slot] = splitSlot(args);
		const router = hooks.useRouter();
		return hooks.useNavigate(
			{ from: (router.routesById as any)[id].fullPath },
			subSlot(slot, 'r:n'),
		);
	};
	function RouteLink(props: any) @{
		const router = hooks.useRouter();
		<Link from={(router.routesById as any)[id].fullPath} {...props} />
	}
	route.Link = RouteLink;
	route.notFound = (options: any) => notFound({ routeId: id, ...options });
	return route;
};

export const createFileRoute: typeof FileFactories.createFileRoute = () => (options: any) => {
	const route = createRoute(options) as any;
	route.isRoot = false;
	return route;
};

function lazyRoute(options: any) {
	const route = { options } as any;
	attachLazyRouteHooks(route);
	return route;
}

export const createLazyRoute: typeof FileFactories.createLazyRoute = (id: any) => (options: any) =>
	lazyRoute({ id, ...options });
export const createLazyFileRoute: typeof FileFactories.createLazyFileRoute = (id: any) =>
	typeof id === 'object' ? lazyRoute(id) : (options: any) => lazyRoute({ id, ...options });
