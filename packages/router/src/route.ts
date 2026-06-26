// Route factories. `@tanstack/router-core` ships the `BaseRoute`/`BaseRootRoute`
// classes but NOT the ergonomic `createRoute`/`createRootRoute` factories (those
// live in react-router and just `new` the class). The subclasses carry no React —
// the component/error types they bind are erased at runtime — so octane's are
// thin `new`-wrappers over the core classes.
import { BaseRoute, BaseRootRoute } from '@tanstack/router-core';

export class Route extends (BaseRoute as any) {}
export class RootRoute extends (BaseRootRoute as any) {}

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
