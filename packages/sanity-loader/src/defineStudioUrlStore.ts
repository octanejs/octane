import type { CreateQueryStoreOptions } from '@sanity/core-loader';

type StudioUrlLike =
	| import('@sanity/client/csm').StudioUrl
	| import('@sanity/client/csm').ResolveStudioUrl
	| undefined;

export function defineStudioUrlStore(client: CreateQueryStoreOptions['client']): {
	subscribe: (callback: () => void) => () => void;
	getSnapshot: () => StudioUrlLike;
	getServerSnapshot: () => StudioUrlLike;
	setStudioUrl: (nextStudioUrl: StudioUrlLike) => void;
} {
	let studioUrl: StudioUrlLike =
		typeof client === 'object' ? client?.config().stega.studioUrl : undefined;
	const serverSnapshot = studioUrl;
	const subscribers = new Set<() => void>();

	return {
		subscribe(callback) {
			subscribers.add(callback);
			return () => subscribers.delete(callback);
		},
		getSnapshot() {
			return studioUrl;
		},
		getServerSnapshot() {
			return serverSnapshot;
		},
		setStudioUrl(nextStudioUrl) {
			studioUrl = nextStudioUrl;
			subscribers.forEach((callback) => callback());
		},
	};
}
