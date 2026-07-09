// Route factories + the route-bound hook accessors. `@tanstack/router-core`
// ships the `BaseRoute`/`BaseRootRoute`/`BaseRouteApi` classes but NOT the
// ergonomic factories or the React-side hook accessors (`Route.useLoaderData()`,
// `getRouteApi(id).useParams()`, …) — those live in react-router's route.tsx and
// are ported here 1:1 on octane's hooks. The accessors are this-bound instance
// closures (upstream uses arrow-function class fields) and follow the binding's
// slot convention: the octane compiler wraps method-style `use*()` calls in
// `withSlot` and passes the call-site symbol as the trailing argument, which
// each accessor forwards to the hooks it composes.
import { BaseRoute, BaseRootRoute, BaseRouteApi, notFound } from '@tanstack/router-core';
import { createElement } from 'octane';
import {
	useMatch,
	useParams,
	useSearch,
	useLoaderData,
	useLoaderDeps,
	useRouteContext,
	useNavigate,
} from './hooks';
import { useRouter } from './context';
import { splitSlot, subSlot } from './internal';
import { Link } from './Link.tsrx';

// Attach the hook accessors to a route-shaped instance (Route / RootRoute /
// RouteApi). `strictLoaderHooks: false` is RouteApi's mode — its loader hooks
// pass `strict: false` upstream (the api may be read from ancestor layouts).
function attachRouteHooks(self: any, strictLoaderHooks: boolean): void {
	self.useMatch = (...args: any[]) => {
		const [user, slot] = splitSlot(args);
		const opts = user[0] ?? {};
		return useMatch(
			{ select: opts.select, structuralSharing: opts.structuralSharing, from: self.id },
			subSlot(slot, 'r:m'),
		);
	};
	self.useRouteContext = (...args: any[]) => {
		const [user, slot] = splitSlot(args);
		const opts = user[0] ?? {};
		return useRouteContext({ ...opts, from: self.id }, subSlot(slot, 'r:ctx'));
	};
	self.useSearch = (...args: any[]) => {
		const [user, slot] = splitSlot(args);
		const opts = user[0] ?? {};
		return useSearch(
			{ select: opts.select, structuralSharing: opts.structuralSharing, from: self.id },
			subSlot(slot, 'r:s'),
		);
	};
	self.useParams = (...args: any[]) => {
		const [user, slot] = splitSlot(args);
		const opts = user[0] ?? {};
		return useParams(
			{ select: opts.select, structuralSharing: opts.structuralSharing, from: self.id },
			subSlot(slot, 'r:p'),
		);
	};
	self.useLoaderDeps = (...args: any[]) => {
		const [user, slot] = splitSlot(args);
		const opts = user[0] ?? {};
		return useLoaderDeps(
			strictLoaderHooks ? { ...opts, from: self.id } : { ...opts, from: self.id, strict: false },
			subSlot(slot, 'r:d'),
		);
	};
	self.useLoaderData = (...args: any[]) => {
		const [user, slot] = splitSlot(args);
		const opts = user[0] ?? {};
		return useLoaderData(
			strictLoaderHooks ? { ...opts, from: self.id } : { ...opts, from: self.id, strict: false },
			subSlot(slot, 'r:l'),
		);
	};
}

export class Route extends (BaseRoute as any) {
	constructor(options?: any) {
		super(options);
		attachRouteHooks(this, true);
		(this as any).useNavigate = (...args: any[]) => {
			const [, slot] = splitSlot(args);
			return useNavigate({ from: (this as any).fullPath }, subSlot(slot, 'r:n'));
		};
		(this as any).Link = (props: any) =>
			createElement(Link as any, { from: (this as any).fullPath, ...props });
	}
}

export class RootRoute extends (BaseRootRoute as any) {
	constructor(options?: any) {
		super(options);
		attachRouteHooks(this, true);
		(this as any).useNavigate = (...args: any[]) => {
			const [, slot] = splitSlot(args);
			return useNavigate({ from: (this as any).fullPath }, subSlot(slot, 'r:n'));
		};
		(this as any).Link = (props: any) =>
			createElement(Link as any, { from: (this as any).fullPath, ...props });
	}
}

export function createRoute(options: any): any {
	return new (Route as any)(options);
}

export function createRootRoute(options?: any): any {
	return new (RootRoute as any)(options);
}

// `createRootRouteWithContext<TContext>()` is a curried type-only helper that just
// returns `createRootRoute` — the context is a compile-time concern.
export function createRootRouteWithContext<_TContext>() {
	return (options?: any) => createRootRoute(options);
}

// getRouteApi — route-bound hooks without importing the route (avoids circular
// imports in code-split files). Port of react-router's RouteApi class.
export class RouteApi extends (BaseRouteApi as any) {
	/** @deprecated Use the `getRouteApi` function instead. */
	constructor({ id }: { id: any }) {
		super({ id });
		attachRouteHooks(this, false);
		(this as any).useNavigate = (...args: any[]) => {
			const [, slot] = splitSlot(args);
			const router = useRouter();
			return useNavigate(
				{ from: router.routesById[(this as any).id].fullPath },
				subSlot(slot, 'r:n'),
			);
		};
		(this as any).notFound = (opts?: any) => notFound({ routeId: (this as any).id, ...opts });
		(this as any).Link = (props: any) => {
			const router = useRouter();
			const fullPath = router.routesById[(this as any).id].fullPath;
			return createElement(Link as any, { from: fullPath, ...props });
		};
	}
}

export function getRouteApi(id: any): any {
	return new (RouteApi as any)({ id });
}

// Identity at runtime (the shape is a RouteMask; types constrain it upstream).
export function createRouteMask(opts: any): any {
	return opts;
}
