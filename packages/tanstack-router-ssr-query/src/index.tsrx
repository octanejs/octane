// Octane port of @tanstack/react-router-ssr-query@1.167.1 (src/index.tsx,
// 29 lines): delegates to the framework-agnostic
// @tanstack/router-ssr-query-core and wraps the router's Wrap option in a
// QueryClientProvider. Fragment comes from octane; everything else is
// verbatim upstream.
import { Fragment } from 'octane';
import { QueryClientProvider } from '@octanejs/tanstack-query';
import { setupCoreRouterSsrQueryIntegration } from '@tanstack/router-ssr-query-core';
import type { RouterSsrQueryOptions } from '@tanstack/router-ssr-query-core';
import type { AnyRouter } from '@octanejs/tanstack-router';

export type Options<TRouter extends AnyRouter> = RouterSsrQueryOptions<TRouter> & {
		wrapQueryClient?: boolean;
	};

export function setupRouterSsrQueryIntegration<TRouter extends AnyRouter>(opts: Options<TRouter>) {
	setupCoreRouterSsrQueryIntegration(opts as any);

	if (opts.wrapQueryClient === false) {
		return;
	}
	const OGWrap = opts.router.options.Wrap || Fragment;

	opts.router.options.Wrap = ({ children }: { children?: unknown }) => {
		return <QueryClientProvider client={opts.queryClient}>
			<OGWrap>{children}</OGWrap>
		</QueryClientProvider>;
	};
}
