import { SuspenseCache } from './SuspenseCache.js';
const suspenseCacheSymbol = Symbol.for('apollo.suspenseCache');
export function getSuspenseCache(client) {
	if (!client[suspenseCacheSymbol]) {
		client[suspenseCacheSymbol] = new SuspenseCache(client.defaultOptions.react?.suspense);
	}
	return client[suspenseCacheSymbol];
}
