import { pipe, subscribe } from 'wonka';
import type { Client, OperationResult } from '@urql/core';

type CacheEntry = OperationResult | Promise<unknown> | undefined;

interface Cache {
	get(key: number): CacheEntry;
	set(key: number, value: CacheEntry): void;
	clear(key: number): void;
	dispose(key: number): void;
}

interface ClientWithCache extends Client {
	_react?: Cache;
}

export function getCacheForClient(client: Client): Cache {
	if (!(client as ClientWithCache)._react) {
		const reclaim = new Set();
		const map = new Map<number, CacheEntry>();

		if (client.operations$) {
			pipe(
				client.operations$,
				subscribe(function onOperation(operation) {
					if (operation.kind === 'teardown' && reclaim.has(operation.key)) {
						reclaim.delete(operation.key);
						map.delete(operation.key);
					}
				}),
			);
		}

		(client as ClientWithCache)._react = {
			get: function get(key) {
				return map.get(key);
			},
			set: function set(key, value) {
				reclaim.delete(key);
				map.set(key, value);
			},
			clear: function clear(key) {
				reclaim.delete(key);
				map.delete(key);
			},
			dispose: function dispose(key) {
				reclaim.add(key);
			},
		};
	}

	return (client as ClientWithCache)._react!;
}
