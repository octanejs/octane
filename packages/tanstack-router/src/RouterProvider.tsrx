// Places the router into context and renders the active match tree. Mirrors
// react-router's RouterProvider.tsx: `RouterContextProvider` is the low-level
// provider — it forwards any extra props into `router.update()` (so
// `<RouterProvider router={r} defaultPreload="intent">` reconfigures the
// instance), wraps in `router.options.Wrap` when configured, and provides the
// router; `RouterProvider` renders `<Matches/>` inside it.
import { hasKeys } from '@tanstack/router-core';
import type { AnyRouter, RegisteredRouter, RouterOptions } from '@tanstack/router-core';
import type { OctaneNode } from 'octane';
import { routerContext } from './context.ts';
import { Matches } from './Matches.tsrx';
import { SafeFragment } from './SafeFragment.tsrx';

export type RouterProps<
	TRouter extends AnyRouter = RegisteredRouter,
	TDehydrated extends Record<string, any> = Record<string, any>,
> =
	Omit<
		RouterOptions<
			TRouter['routeTree'],
			NonNullable<TRouter['options']['trailingSlash']>,
			NonNullable<TRouter['options']['defaultStructuralSharing']>,
			TRouter['history'],
			TDehydrated
		>,
		'context'
	> & {
		router: TRouter;
		context?: Partial<
			RouterOptions<
				TRouter['routeTree'],
				NonNullable<TRouter['options']['trailingSlash']>,
				NonNullable<TRouter['options']['defaultStructuralSharing']>,
				TRouter['history'],
				TDehydrated
			>['context']
		>;
	};

export function RouterContextProvider<
	TRouter extends AnyRouter = RegisteredRouter,
	TDehydrated extends Record<string, any> = Record<string, any>,
>(props: RouterProps<TRouter, TDehydrated> & { children?: OctaneNode }) @{
	const { router, children, ...rest } = props;
	if (hasKeys(rest)) {
		router.update({
			...router.options,
			...rest,
			context: {
				...router.options.context,
				...rest.context,
			},
		});
	}
	const Wrap = router.options.Wrap ?? SafeFragment;

	<Wrap>
		<routerContext.Provider value={router}>{children}</routerContext.Provider>
	</Wrap>
}

export function RouterProvider<
	TRouter extends AnyRouter = RegisteredRouter,
	TDehydrated extends Record<string, any> = Record<string, any>,
>(props: RouterProps<TRouter, TDehydrated>) @{
	const { router, ...rest } = props;

	<RouterContextProvider router={router} {...rest}>
		<Matches />
	</RouterContextProvider>
}
