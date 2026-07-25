import type { AnyRouter } from '@octanejs/tanstack-router';
import type { RouterSsrQueryOptions } from '@tanstack/router-ssr-query-core';

export type Options<TRouter extends AnyRouter> = RouterSsrQueryOptions<TRouter> & {
	wrapQueryClient?: boolean;
};

export declare function setupRouterSsrQueryIntegration<TRouter extends AnyRouter>(
	options: Options<TRouter>,
): void;
