import { hydrateRoot, initializeHydrationEventCapture } from 'octane';
import { createDocusaurusBrowserRouter, DocusaurusRouterProvider } from './client.js';

function abortError(signal) {
	return signal.reason ?? new DOMException('Docusaurus hydration was aborted.', 'AbortError');
}

function waitForRouter(router, signal) {
	if (signal?.aborted) return Promise.reject(abortError(signal));
	if (router.state.initialized) return Promise.resolve();

	return new Promise((resolve, reject) => {
		let settled = false;
		let unsubscribe = () => {};

		const finish = (error) => {
			if (settled) return;
			settled = true;
			unsubscribe();
			signal?.removeEventListener('abort', onAbort);
			if (error === undefined) resolve();
			else reject(error);
		};
		const onAbort = () => finish(abortError(signal));

		unsubscribe = router.subscribe((state) => {
			if (state.initialized) finish();
		});
		signal?.addEventListener('abort', onAbort, { once: true });
		if (router.state.initialized) finish();
	});
}

export async function hydrateDocusaurusRoot(container, manifest, registry, options = {}) {
	const { identifierPrefix, signal, ...routerOptions } = options;
	initializeHydrationEventCapture(container.ownerDocument);

	const router = createDocusaurusBrowserRouter(manifest, registry, routerOptions);
	try {
		await waitForRouter(router, signal);
		const root = hydrateRoot(
			container,
			DocusaurusRouterProvider,
			{ manifest, router },
			{ identifierPrefix },
		);
		return { root, router };
	} catch (error) {
		router.dispose();
		throw error;
	}
}
