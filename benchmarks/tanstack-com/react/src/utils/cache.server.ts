import { LRUCache } from 'lru-cache';

declare global {
	var docCache: LRUCache<string, any>;
	var pendingDocCache: Map<string, Promise<any>>;
}

const docCache =
	globalThis.docCache ||
	(globalThis.docCache = new LRUCache<string, any>({
		max: 300,
		ttl: process.env.NODE_ENV === 'production' ? 1 : 1000000,
		noDeleteOnStaleGet: true,
	}));

const pendingDocCache = globalThis.pendingDocCache || (globalThis.pendingDocCache = new Map());

function getCached<T>(key: string): T | undefined {
	const value = docCache.get(key);

	return value === undefined ? undefined : (value as T);
}

async function withPendingCache<T>(key: string, fn: () => Promise<T>) {
	const pending = pendingDocCache.get(key);

	if (pending) {
		return pending as Promise<T>;
	}

	const promise = fn().finally(() => {
		pendingDocCache.delete(key);
	});

	pendingDocCache.set(key, promise);

	return promise;
}

export async function fetchCached<T>(opts: {
	fn: () => Promise<T>;
	key: string;
	ttl: number;
}): Promise<T> {
	const cached = getCached<T>(opts.key);

	if (cached !== undefined) {
		return cached;
	}

	return withPendingCache(opts.key, async () => {
		const result = await opts.fn();

		docCache.set(opts.key, result, {
			ttl: opts.ttl,
		});

		return result;
	});
}
