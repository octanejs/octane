// Shared import/preload and stale-module recovery. The renderer decides how to
// invoke the resolved component.
import { use } from 'octane';
import { isModuleNotFoundError } from '@tanstack/router-core';
import { toExternalHydrationThenable } from './externalHydration';

export function createLazyRouteLoader(importer: () => Promise<any>, exportName?: string) {
	let loadPromise: Promise<any> | undefined;
	let comp: any;
	let error: any;
	let reload = false;
	const preload = () => {
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
	return {
		preload,
		read() {
			if (reload) {
				window.location.reload();
				throw new Promise(() => {});
			}
			if (error) throw error;
			if (!comp) use(toExternalHydrationThenable(preload()));
			return comp;
		},
	};
}
