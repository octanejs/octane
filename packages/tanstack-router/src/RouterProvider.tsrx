// Places the router into context and renders the active match tree. Mirrors
// react-router's RouterProvider.tsx: `RouterContextProvider` is the low-level
// provider — it forwards any extra props into `router.update()` (so
// `<RouterProvider router={r} defaultPreload="intent">` reconfigures the
// instance), wraps in `router.options.Wrap` when configured, and provides the
// router; `RouterProvider` renders `<Matches/>` inside it.
import { hasKeys } from '@tanstack/router-core';
import type { AnyRouter } from '@tanstack/router-core';
import type { OctaneNode } from 'octane';
import { routerContext } from './context.ts';
import { Matches } from './Matches.tsrx';
import { SafeFragment } from './SafeFragment.tsrx';

// Upstream's `RouterProps` is `Omit<RouterOptions<…>, 'context'> & { router }` —
// extra props reconfigure the instance via `router.update()`. The octane binding
// keeps the router-typed member strict and the option passthrough permissive.
export type RouterProps = {
		router: AnyRouter;
		context?: Record<string, any>;
	} & Record<string, any>;

export function RouterContextProvider(props: RouterProps & { children?: OctaneNode }) @{
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

export function RouterProvider(props: RouterProps) @{
	const { router, ...rest } = props;

	<RouterContextProvider router={router} {...rest}>
		<Matches />
	</RouterContextProvider>
}
