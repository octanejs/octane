// Local module augmentation to add server property to file routes
// This mirrors @tanstack/start-client-core/serverRoute but is local to ensure it's loaded

import type { AnyRoute } from '@tanstack/router-core';

declare module '@tanstack/router-core' {
	interface FilebaseRouteOptionsInterface<
		_TRegister,
		_TParentRoute extends AnyRoute,
		_TId extends string,
		_TPath extends string,
		_TSearchValidator,
		_TParams,
		_TLoaderDeps extends Record<string, any>,
		_TLoaderFn,
		_TRouterContext,
		_TRouteContextFn,
		_TBeforeLoadFn,
		_TRemountDepsFn,
		_TSSR,
		_TServerMiddlewares,
		_THandlers,
	> {
		server?: {
			middleware?: unknown;
			handlers?:
				| Record<
						'ANY' | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD',
						(ctx: {
							request: Request;
							params: TParams;
							pathname: string;
							context?: unknown;
							next?: <TContext = undefined>(options?: {
								context?: TContext;
							}) => {
								isNext: true;
								context: TContext;
							};
						}) => Response | Promise<Response> | undefined | Promise<undefined>
				  >
				| ((opts: unknown) => Record<string, unknown>);
		};
	}
}
