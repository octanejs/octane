import { createRoute } from './route';
import type { Route } from './route';
import {
	useLoaderData,
	useLoaderDeps,
	useMatch,
	useNavigate,
	useParams,
	useRouteContext,
	useSearch,
} from './hooks';
import { useRouter } from './context';
import { createRouteHookBindings } from './routeHookBindings';

const { attachLazyRouteHooks } = createRouteHookBindings(
	{ useMatch, useParams, useSearch, useLoaderData, useLoaderDeps, useRouteContext, useNavigate },
	useRouter,
);
import type {
	AnyContext,
	AnyRoute,
	AnyRouter,
	Constrain,
	ConstrainLiteral,
	FileBaseRouteOptions,
	FileRoutesByPath,
	LazyRouteOptions,
	Register,
	RegisteredRouter,
	ResolveParams,
	RouteById,
	RouteConstraints,
	RouteIds,
	RouteLoaderEntry,
	UpdatableRouteOptions,
	UseNavigateResult,
} from '@tanstack/router-core';
import type {
	UseLoaderDataRoute,
	UseLoaderDepsRoute,
	UseMatchRoute,
	UseParamsRoute,
	UseRouteContextRoute,
	UseSearchRoute,
} from './routeHookTypes';

declare const process: {
	env: {
		NODE_ENV?: string;
	};
};

export function createFileRoute<
	TFilePath extends keyof FileRoutesByPath,
	TParentRoute extends AnyRoute = FileRoutesByPath[TFilePath]['parentRoute'],
	TId extends RouteConstraints['TId'] = FileRoutesByPath[TFilePath]['id'],
	TPath extends RouteConstraints['TPath'] = FileRoutesByPath[TFilePath]['path'],
	TFullPath extends RouteConstraints['TFullPath'] = FileRoutesByPath[TFilePath]['fullPath'],
>(path?: TFilePath): FileRoute<TFilePath, TParentRoute, TId, TPath, TFullPath>['createRoute'] {
	return new FileRoute<TFilePath, TParentRoute, TId, TPath, TFullPath>(path, {
		silent: true,
	}).createRoute;
}

/** @deprecated Use `createFileRoute(path)(options)` instead. */
export class FileRoute<
	TFilePath extends keyof FileRoutesByPath,
	TParentRoute extends AnyRoute = FileRoutesByPath[TFilePath]['parentRoute'],
	TId extends RouteConstraints['TId'] = FileRoutesByPath[TFilePath]['id'],
	TPath extends RouteConstraints['TPath'] = FileRoutesByPath[TFilePath]['path'],
	TFullPath extends RouteConstraints['TFullPath'] = FileRoutesByPath[TFilePath]['fullPath'],
> {
	silent?: boolean;

	constructor(
		public path?: TFilePath,
		_opts?: { silent: boolean },
	) {
		this.silent = _opts?.silent;
	}

	createRoute = <
		TRegister = Register,
		TSearchValidator = undefined,
		TParams = ResolveParams<TPath>,
		TRouteContextFn = AnyContext,
		TBeforeLoadFn = AnyContext,
		TLoaderDeps extends Record<string, any> = {},
		TLoaderFn = undefined,
		TChildren = unknown,
		TSSR = unknown,
		const TMiddlewares = unknown,
		THandlers = undefined,
	>(
		options?: FileBaseRouteOptions<
			TRegister,
			TParentRoute,
			TId,
			TPath,
			TSearchValidator,
			TParams,
			TLoaderDeps,
			TLoaderFn,
			AnyContext,
			TRouteContextFn,
			TBeforeLoadFn,
			AnyContext,
			TSSR,
			TMiddlewares,
			THandlers
		> &
			UpdatableRouteOptions<
				TParentRoute,
				TId,
				TFullPath,
				TParams,
				TSearchValidator,
				TLoaderFn,
				TLoaderDeps,
				AnyContext,
				TRouteContextFn,
				TBeforeLoadFn
			>,
	): Route<
		TRegister,
		TParentRoute,
		TPath,
		TFullPath,
		TFilePath,
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
		TMiddlewares,
		THandlers
	> => {
		if (process.env.NODE_ENV !== 'production' && !this.silent) {
			console.warn('Warning: FileRoute is deprecated. Use createFileRoute(path)(options) instead.');
		}
		const route = createRoute(options as any);
		(route as any).isRoot = false;
		return route as any;
	};
}

/** @deprecated Place the loader in the main `createFileRoute` options. */
export function FileRouteLoader<
	TFilePath extends keyof FileRoutesByPath,
	TRoute extends FileRoutesByPath[TFilePath]['preLoaderRoute'],
>(
	_path: TFilePath,
): <TLoaderFn>(
	loaderFn: Constrain<
		TLoaderFn,
		RouteLoaderEntry<
			Register,
			TRoute['parentRoute'],
			TRoute['types']['id'],
			TRoute['types']['params'],
			TRoute['types']['loaderDeps'],
			TRoute['types']['routerContext'],
			TRoute['types']['routeContextFn'],
			TRoute['types']['beforeLoadFn']
		>
	>,
) => TLoaderFn {
	if (process.env.NODE_ENV !== 'production') {
		console.warn(
			'Warning: FileRouteLoader is deprecated. Place the loader in createFileRoute options.',
		);
	}
	return (loaderFn) => loaderFn as never;
}

declare module '@tanstack/router-core' {
	export interface LazyRoute<in out TRoute extends AnyRoute> {
		useMatch: UseMatchRoute<TRoute['id']>;
		useRouteContext: UseRouteContextRoute<TRoute['id']>;
		useSearch: UseSearchRoute<TRoute['id']>;
		useParams: UseParamsRoute<TRoute['id']>;
		useLoaderDeps: UseLoaderDepsRoute<TRoute['id']>;
		useLoaderData: UseLoaderDataRoute<TRoute['id']>;
		useNavigate: () => UseNavigateResult<TRoute['fullPath']>;
	}
}

export class LazyRoute<TRoute extends AnyRoute> {
	options: { id: string } & LazyRouteOptions;
	declare useMatch: UseMatchRoute<TRoute['id']>;
	declare useRouteContext: UseRouteContextRoute<TRoute['id']>;
	declare useSearch: UseSearchRoute<TRoute['id']>;
	declare useParams: UseParamsRoute<TRoute['id']>;
	declare useLoaderDeps: UseLoaderDepsRoute<TRoute['id']>;
	declare useLoaderData: UseLoaderDataRoute<TRoute['id']>;
	declare useNavigate: () => UseNavigateResult<TRoute['fullPath']>;

	constructor(opts: { id: string } & LazyRouteOptions) {
		this.options = opts;
		attachLazyRouteHooks(this);
	}
}

export function createLazyRoute<
	TRouter extends AnyRouter = RegisteredRouter,
	TId extends string = string,
	TRoute extends AnyRoute = RouteById<TRouter['routeTree'], TId>,
>(id: ConstrainLiteral<TId, RouteIds<TRouter['routeTree']>>) {
	return (opts: LazyRouteOptions) => new LazyRoute<TRoute>({ id, ...opts });
}

export function createLazyFileRoute<
	TFilePath extends keyof FileRoutesByPath,
	TRoute extends FileRoutesByPath[TFilePath]['preLoaderRoute'] & AnyRoute =
		FileRoutesByPath[TFilePath]['preLoaderRoute'],
>(id: TFilePath): (opts: LazyRouteOptions) => LazyRoute<TRoute> {
	if (typeof id === 'object') {
		return new LazyRoute<TRoute>(id) as any;
	}
	return (opts: LazyRouteOptions) => new LazyRoute<TRoute>({ id, ...opts });
}
