'use strong';

import { createCompiledContext, useContext } from 'octane';
import type { AnyRouter, RegisteredRouter } from '@tanstack/router-core';
import { createRouterHooks } from '../hookBindings';
import { createUseRouterState } from '../routerStateBinding';

// The normal contexts remain callable providers. These contexts belong only to
// the opt-in compiled tree so that using it never imports a generic provider.
export const routerContext = createCompiledContext<AnyRouter | undefined>(undefined);
export const matchContext = createCompiledContext<string | undefined>(undefined);

export function useRouter<TRouter extends AnyRouter = RegisteredRouter>(opts?: {
	router?: TRouter;
	warn?: boolean;
}): TRouter;
export function useRouter(...args: unknown[]): AnyRouter {
	const opts = (args.length && typeof args[0] !== 'symbol' ? args[0] : undefined) as
		{ router?: AnyRouter; warn?: boolean } | undefined;
	const router = opts?.router ?? useContext(routerContext);
	if (!router && opts?.warn !== false) {
		throw new Error('Use compiled router hooks inside <CompiledRouterProvider>.');
	}
	return router as AnyRouter;
}

export const {
	useMatch,
	useParams,
	useSearch,
	useLoaderData,
	useLoaderDeps,
	useRouteContext,
	useLocation,
	useMatches,
	useParentMatches,
	useChildMatches,
	useNavigate,
	useCanGoBack,
} = createRouterHooks(useRouter, () => useContext(matchContext));

export const useRouterState = createUseRouterState(useRouter);
