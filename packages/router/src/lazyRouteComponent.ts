// Code-split a route's component: wrap a dynamic import as a component that suspends
// (via octane's `use`) until the module loads, then renders it. Carries `.preload()`
// for hover/intent preloading, and reloads the page once on a stale-chunk
// module-not-found error (the same recovery react-router does).
//
//   createRoute({ path: 'item/$id', component: lazyRouteComponent(() => import('./Item')) })
import { use, createElement } from 'octane';
import { isModuleNotFoundError } from '@tanstack/router-core';

export function lazyRouteComponent(
	importer: () => Promise<any>,
	exportName?: string,
): ((props: any) => any) & { preload: () => Promise<any> | undefined } {
	let loadPromise: Promise<any> | undefined;
	let comp: any;
	let error: any;
	let reload = false;

	const load = () => {
		if (!loadPromise) {
			loadPromise = importer()
				.then((res) => {
					loadPromise = undefined;
					comp = res[exportName ?? 'default'];
				})
				.catch((err) => {
					error = err;
					if (
						isModuleNotFoundError(error) &&
						error instanceof Error &&
						typeof window !== 'undefined' &&
						typeof sessionStorage !== 'undefined'
					) {
						const key = `tanstack_router_reload:${error.message}`;
						if (!sessionStorage.getItem(key)) {
							sessionStorage.setItem(key, '1');
							reload = true;
						}
					}
				});
		}
		return loadPromise;
	};

	const Lazy = (props: any) => {
		if (reload) {
			window.location.reload();
			throw new Promise(() => {});
		}
		if (error) throw error;
		if (!comp) use(load());
		return createElement(comp, props);
	};
	Lazy.preload = load;
	return Lazy;
}
