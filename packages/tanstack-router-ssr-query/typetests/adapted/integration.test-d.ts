import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
import * as Integration from '@octanejs/tanstack-router-ssr-query';
import type { AnyRouter } from '@octanejs/tanstack-router';
import type { QueryClient, DehydrateOptions, HydrateOptions } from '@tanstack/query-core';

type PublicOptions = Assert<
	Equal<
		keyof Integration.Options<AnyRouter>,
		| 'router'
		| 'queryClient'
		| 'dehydrateOptions'
		| 'hydrateOptions'
		| 'handleRedirects'
		| 'wrapQueryClient'
	>
>;
type WrappingControl = Assert<
	Equal<Integration.Options<AnyRouter>['wrapQueryClient'], boolean | undefined>
>;
type RedirectControl = Assert<
	Equal<Integration.Options<AnyRouter>['handleRedirects'], boolean | undefined>
>;
type ClientIdentity = Assert<Equal<Integration.Options<AnyRouter>['queryClient'], QueryClient>>;
type SetupResult = Assert<
	Equal<ReturnType<typeof Integration.setupRouterSsrQueryIntegration>, void>
>;
// @ts-expect-error Integration requires both a router and a query client.
Integration.setupRouterSsrQueryIntegration({});
// @ts-expect-error The wrapping control is a boolean.
const invalidOptions: Integration.Options<AnyRouter> = { wrapQueryClient: 'false' };
