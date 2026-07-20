import { use } from 'octane';
import { hydrate } from '@tanstack/router-core/ssr/client';
import type { AnyRouter } from '@tanstack/router-core';
import { RouterProvider } from '../RouterProvider.tsrx';
import { toExternalHydrationThenable } from '../externalHydration.ts';

const hydrationPromises = new WeakMap<AnyRouter, PromiseLike<void>>();
const ready = {
	status: 'fulfilled',
	value: undefined,
	then(onfulfilled?: (() => void) | null): Promise<void> {
		return Promise.resolve(onfulfilled?.());
	},
};

function getHydrationPromise(router: AnyRouter) {
	let promise = hydrationPromises.get(router);
	if (!promise) {
		promise = router.stores.matchesId.get().length ? ready as PromiseLike<void> : hydrate(router);
		hydrationPromises.set(router, promise);
	}
	return promise;
}

function RouterClientInner(props: { router: AnyRouter }) @{
	use(toExternalHydrationThenable(getHydrationPromise(props.router)));
	<RouterProvider router={props.router} />
}

export function RouterClient(props: { router: AnyRouter }) @{
	@try {
		<RouterClientInner router={props.router} />
	} @pending {
		<></>
	}
}
