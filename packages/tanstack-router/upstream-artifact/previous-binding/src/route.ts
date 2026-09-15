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
import type {
	AnyContext,
	AnyRoute,
	AnyRouter,
	ConstrainLiteral,
	ErrorComponentProps,
	NotFoundError,
	NotFoundRouteProps,
	Register,
	RegisteredRouter,
	ResolveFullPath,
	ResolveId,
	ResolveParams,
	RootRoute as RootRouteCore,
	RootRouteId,
	RootRouteOptions,
	Route as RouteCore,
	RouteConstraints,
	RouteIds,
	RouteMask,
	RouteOptions,
	RouteTypesById,
	RouterCore,
	ToMaskOptions,
	UseNavigateResult,
} from '@tanstack/router-core';
import { createElement } from 'octane';
import type { ComponentBody } from 'octane';
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
import type {
	UseLoaderDataRoute,
	UseLoaderDepsRoute,
	UseMatchRoute,
	UseParamsRoute,
	UseRouteContextRoute,
	UseSearchRoute,
} from './routeHookTypes';
import type { LinkComponentRoute } from './linkTypes';

// ── Component types (react-router's route.tsx, on octane renderables) ────────
// Octane analog of React's `ErrorInfo` (octane reports no component stacks).
export type ErrorInfo = {
	componentStack?: string | null;
	digest?: string | null;
};

export interface DefaultRouteTypes<TProps> {
	component: ComponentBody<TProps>;
}

export interface RouteTypes<TProps> extends DefaultRouteTypes<TProps> {}

export type SyncRouteComponent<TProps> = RouteTypes<TProps>['component'];
export type AsyncRouteComponent<TProps> = SyncRouteComponent<TProps> & {
	preload?: () => Promise<void>;
};
export type RouteComponent = AsyncRouteComponent<{}>;
export type ErrorRouteComponent = AsyncRouteComponent<ErrorComponentProps>;
export type NotFoundRouteComponent = SyncRouteComponent<NotFoundRouteProps>;

// router-core leaves the framework-facing component options typed `unknown` and
// each binding narrows them via interface merging — react-router's route.tsx /
// router.tsx do exactly this with React types; this is the octane equivalent.
declare module '@tanstack/router-core' {
	interface UpdatableRouteOptionsExtensions {
		component?: RouteComponent;
		errorComponent?: false | null | undefined | ErrorRouteComponent;
		notFoundComponent?: NotFoundRouteComponent;
		pendingComponent?: RouteComponent;
	}
	interface RootRouteOptionsExtensions {
		shellComponent?: ComponentBody<{ children?: unknown }>;
	}
	interface RouterOptionsExtensions {
		defaultComponent?: RouteComponent;
		defaultErrorComponent?: ErrorRouteComponent;
		defaultPendingComponent?: RouteComponent;
		defaultNotFoundComponent?: NotFoundRouteComponent;
		Wrap?: ComponentBody<{ children?: unknown }>;
		InnerWrap?: ComponentBody<{ children?: unknown }>;
		defaultOnCatch?: (error: Error, errorInfo: ErrorInfo) => void;
	}
}

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

function attachRouteNavigation(self: any): void {
	self.useNavigate = (...args: any[]) => {
		const [, slot] = splitSlot(args);
		return useNavigate({ from: self.fullPath }, subSlot(slot, 'r:n'));
	};
	self.Link = (props: Record<string, unknown>) =>
		createElement(Link as any, { from: self.fullPath, ...props });
}

export class Route<
	in out TRegister = unknown,
	in out TParentRoute extends RouteConstraints['TParentRoute'] = AnyRoute,
	in out TPath extends RouteConstraints['TPath'] = '/',
	in out TFullPath extends RouteConstraints['TFullPath'] = ResolveFullPath<TParentRoute, TPath>,
	in out TCustomId extends RouteConstraints['TCustomId'] = string,
	in out TId extends RouteConstraints['TId'] = ResolveId<TParentRoute, TCustomId, TPath>,
	in out TSearchValidator = undefined,
	in out TParams = ResolveParams<TPath>,
	in out TRouterContext = AnyContext,
	in out TRouteContextFn = AnyContext,
	in out TBeforeLoadFn = AnyContext,
	in out TLoaderDeps extends Record<string, any> = {},
	in out TLoaderFn = undefined,
	in out TChildren = unknown,
	in out TFileRouteTypes = unknown,
	in out TSSR = unknown,
	in out TServerMiddlewares = unknown,
	in out THandlers = undefined,
>
	extends BaseRoute<
		TRegister,
		TParentRoute,
		TPath,
		TFullPath,
		TCustomId,
		TId,
		TSearchValidator,
		TParams,
		TRouterContext,
		TRouteContextFn,
		TBeforeLoadFn,
		TLoaderDeps,
		TLoaderFn,
		TChildren,
		TFileRouteTypes,
		TSSR,
		TServerMiddlewares,
		THandlers
	>
	implements
		RouteCore<
			TRegister,
			TParentRoute,
			TPath,
			TFullPath,
			TCustomId,
			TId,
			TSearchValidator,
			TParams,
			TRouterContext,
			TRouteContextFn,
			TBeforeLoadFn,
			TLoaderDeps,
			TLoaderFn,
			TChildren,
			TFileRouteTypes,
			TSSR,
			TServerMiddlewares,
			THandlers
		>
{
	declare useMatch: UseMatchRoute<TId>;
	declare useRouteContext: UseRouteContextRoute<TId>;
	declare useSearch: UseSearchRoute<TId>;
	declare useParams: UseParamsRoute<TId>;
	declare useLoaderDeps: UseLoaderDepsRoute<TId>;
	declare useLoaderData: UseLoaderDataRoute<TId>;
	declare useNavigate: () => UseNavigateResult<TFullPath>;
	declare Link: LinkComponentRoute<TFullPath>;

	/** @deprecated Use the `createRoute` function instead. */
	constructor(
		options?: RouteOptions<
			TRegister,
			TParentRoute,
			TId,
			TCustomId,
			TFullPath,
			TPath,
			TSearchValidator,
			TParams,
			TLoaderDeps,
			TLoaderFn,
			TRouterContext,
			TRouteContextFn,
			TBeforeLoadFn,
			TSSR,
			TServerMiddlewares,
			THandlers
		>,
	) {
		super(options);
		attachRouteHooks(this, true);
		attachRouteNavigation(this);
	}
}

export class RootRoute<
	in out TRegister = unknown,
	in out TSearchValidator = undefined,
	in out TRouterContext = {},
	in out TRouteContextFn = AnyContext,
	in out TBeforeLoadFn = AnyContext,
	in out TLoaderDeps extends Record<string, any> = {},
	in out TLoaderFn = undefined,
	in out TChildren = unknown,
	in out TFileRouteTypes = unknown,
	in out TSSR = unknown,
	in out TServerMiddlewares = unknown,
	in out THandlers = undefined,
>
	extends BaseRootRoute<
		TRegister,
		TSearchValidator,
		TRouterContext,
		TRouteContextFn,
		TBeforeLoadFn,
		TLoaderDeps,
		TLoaderFn,
		TChildren,
		TFileRouteTypes,
		TSSR,
		TServerMiddlewares,
		THandlers
	>
	implements
		RootRouteCore<
			TRegister,
			TSearchValidator,
			TRouterContext,
			TRouteContextFn,
			TBeforeLoadFn,
			TLoaderDeps,
			TLoaderFn,
			TChildren,
			TFileRouteTypes,
			TSSR,
			TServerMiddlewares,
			THandlers
		>
{
	declare useMatch: UseMatchRoute<RootRouteId>;
	declare useRouteContext: UseRouteContextRoute<RootRouteId>;
	declare useSearch: UseSearchRoute<RootRouteId>;
	declare useParams: UseParamsRoute<RootRouteId>;
	declare useLoaderDeps: UseLoaderDepsRoute<RootRouteId>;
	declare useLoaderData: UseLoaderDataRoute<RootRouteId>;
	declare useNavigate: () => UseNavigateResult<'/'>;
	declare Link: LinkComponentRoute<'/'>;

	/** @deprecated Use `createRootRoute()` instead. */
	constructor(
		options?: RootRouteOptions<
			TRegister,
			TSearchValidator,
			TRouterContext,
			TRouteContextFn,
			TBeforeLoadFn,
			TLoaderDeps,
			TLoaderFn,
			TSSR,
			TServerMiddlewares,
			THandlers
		>,
	) {
		super(options);
		attachRouteHooks(this, true);
		attachRouteNavigation(this);
	}
}

export function createRoute<
	TRegister = unknown,
	TParentRoute extends RouteConstraints['TParentRoute'] = AnyRoute,
	TPath extends RouteConstraints['TPath'] = '/',
	TFullPath extends RouteConstraints['TFullPath'] = ResolveFullPath<TParentRoute, TPath>,
	TCustomId extends RouteConstraints['TCustomId'] = string,
	TId extends RouteConstraints['TId'] = ResolveId<TParentRoute, TCustomId, TPath>,
	TSearchValidator = undefined,
	TParams = ResolveParams<TPath>,
	TRouteContextFn = AnyContext,
	TBeforeLoadFn = AnyContext,
	TLoaderDeps extends Record<string, any> = {},
	TLoaderFn = undefined,
	TChildren = unknown,
	TSSR = unknown,
	const TServerMiddlewares = unknown,
	THandlers = undefined,
>(
	options: RouteOptions<
		TRegister,
		TParentRoute,
		TId,
		TCustomId,
		TFullPath,
		TPath,
		TSearchValidator,
		TParams,
		TLoaderDeps,
		TLoaderFn,
		AnyContext,
		TRouteContextFn,
		TBeforeLoadFn,
		TSSR,
		TServerMiddlewares,
		THandlers
	>,
): Route<
	TRegister,
	TParentRoute,
	TPath,
	TFullPath,
	TCustomId,
	TId,
	TSearchValidator,
	TParams,
	AnyContext,
	TRouteContextFn,
	TBeforeLoadFn,
	TLoaderDeps,
	TLoaderFn,
	TChildren,
	unknown,
	TSSR,
	TServerMiddlewares,
	THandlers
> {
	return new Route(options as any);
}

export function createRootRoute<
	TRegister = Register,
	TSearchValidator = undefined,
	TRouterContext = {},
	TRouteContextFn = AnyContext,
	TBeforeLoadFn = AnyContext,
	TLoaderDeps extends Record<string, any> = {},
	TLoaderFn = undefined,
	TSSR = unknown,
	const TServerMiddlewares = unknown,
	THandlers = undefined,
>(
	options?: RootRouteOptions<
		TRegister,
		TSearchValidator,
		TRouterContext,
		TRouteContextFn,
		TBeforeLoadFn,
		TLoaderDeps,
		TLoaderFn,
		TSSR,
		TServerMiddlewares,
		THandlers
	>,
): RootRoute<
	TRegister,
	TSearchValidator,
	TRouterContext,
	TRouteContextFn,
	TBeforeLoadFn,
	TLoaderDeps,
	TLoaderFn,
	unknown,
	unknown,
	TSSR,
	TServerMiddlewares,
	THandlers
> {
	return new RootRoute(options);
}

// `createRootRouteWithContext<TContext>()` is a curried type-only helper that just
// returns `createRootRoute` — the context is a compile-time concern.
export function createRootRouteWithContext<TRouterContext extends {}>() {
	return <
		TRegister = Register,
		TRouteContextFn = AnyContext,
		TBeforeLoadFn = AnyContext,
		TSearchValidator = undefined,
		TLoaderDeps extends Record<string, any> = {},
		TLoaderFn = undefined,
		TSSR = unknown,
		TServerMiddlewares = unknown,
		THandlers = undefined,
	>(
		options?: RootRouteOptions<
			TRegister,
			TSearchValidator,
			TRouterContext,
			TRouteContextFn,
			TBeforeLoadFn,
			TLoaderDeps,
			TLoaderFn,
			TSSR,
			TServerMiddlewares,
			THandlers
		>,
	) => createRootRoute(options);
}

/** @deprecated Use `createRootRouteWithContext` instead. */
export const rootRouteWithContext = createRootRouteWithContext;

// getRouteApi — route-bound hooks without importing the route (avoids circular
// imports in code-split files). Port of react-router's RouteApi class.
export class RouteApi<TId, TRouter extends AnyRouter = RegisteredRouter> extends BaseRouteApi<
	TId,
	TRouter
> {
	declare useMatch: UseMatchRoute<TId>;
	declare useRouteContext: UseRouteContextRoute<TId>;
	declare useSearch: UseSearchRoute<TId>;
	declare useParams: UseParamsRoute<TId>;
	declare useLoaderDeps: UseLoaderDepsRoute<TId>;
	declare useLoaderData: UseLoaderDataRoute<TId>;
	declare useNavigate: () => UseNavigateResult<RouteTypesById<TRouter, TId>['fullPath']>;
	declare Link: LinkComponentRoute<RouteTypesById<TRouter, TId>['fullPath']>;

	/** @deprecated Use the `getRouteApi` function instead. */
	constructor({ id }: { id: TId }) {
		super({ id });
		attachRouteHooks(this, false);
		this.useNavigate = ((...args: any[]) => {
			const [, slot] = splitSlot(args);
			const router = useRouter();
			return useNavigate(
				{ from: (router.routesById as any)[this.id as string].fullPath },
				subSlot(slot, 'r:n'),
			);
		}) as typeof this.useNavigate;
		this.Link = ((props: Record<string, unknown>) => {
			const router = useRouter();
			const fullPath = (router.routesById as any)[this.id as string].fullPath;
			return createElement(Link as any, { from: fullPath, ...props });
		}) as unknown as typeof this.Link;
	}

	notFound = (opts?: NotFoundError) => notFound({ routeId: this.id, ...opts } as NotFoundError);
}

export function getRouteApi<const TId, TRouter extends AnyRouter = RegisteredRouter>(
	id: ConstrainLiteral<TId, RouteIds<TRouter['routeTree']>>,
) {
	return new RouteApi<TId, TRouter>({ id });
}

export function createRouteMask<
	TRouteTree extends AnyRoute,
	TFrom extends string,
	TTo extends string,
>(
	opts: { routeTree: TRouteTree } & ToMaskOptions<
		RouterCore<TRouteTree, 'never', boolean>,
		TFrom,
		TTo
	>,
): RouteMask<TRouteTree> {
	return opts as any;
}

export type AnyRootRoute = RootRoute<any, any, any, any, any, any, any, any, any, any, any, any>;

export class NotFoundRoute<
	TRegister,
	TParentRoute extends AnyRootRoute,
	TRouterContext = AnyContext,
	TRouteContextFn = AnyContext,
	TBeforeLoadFn = AnyContext,
	TSearchValidator = undefined,
	TLoaderDeps extends Record<string, any> = {},
	TLoaderFn = undefined,
	TChildren = unknown,
	TSSR = unknown,
	TServerMiddlewares = unknown,
> extends Route<
	TRegister,
	TParentRoute,
	'/404',
	'/404',
	'404',
	'404',
	TSearchValidator,
	{},
	TRouterContext,
	TRouteContextFn,
	TBeforeLoadFn,
	TLoaderDeps,
	TLoaderFn,
	TChildren,
	unknown,
	TSSR,
	TServerMiddlewares
> {
	constructor(
		options: Omit<
			RouteOptions<
				TRegister,
				TParentRoute,
				string,
				string,
				string,
				string,
				TSearchValidator,
				{},
				TLoaderDeps,
				TLoaderFn,
				TRouterContext,
				TRouteContextFn,
				TBeforeLoadFn,
				TSSR,
				TServerMiddlewares
			>,
			'caseSensitive' | 'parseParams' | 'stringifyParams' | 'path' | 'id' | 'params'
		>,
	) {
		super({ ...(options as any), id: '404' });
	}
}
