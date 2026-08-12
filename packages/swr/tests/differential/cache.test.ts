import { describe, expect, it, vi } from 'vitest';
import * as octane from '../../src/_internal/index';
import { initCache as reactInitCache } from '../../upstream/src/_internal/utils/cache';
import { createCacheHelper as reactCreateCacheHelper } from '../../upstream/src/_internal/utils/helper';
import { stableHash as reactStableHash } from '../../upstream/src/_internal/utils/hash';
import { mergeConfigs as reactMergeConfigs } from '../../upstream/src/_internal/utils/merge-config';
import { serialize as reactSerialize } from '../../upstream/src/_internal/utils/serialize';

const candidates = [
	'',
	'key',
	['tuple', 1, false],
	{ z: undefined, nested: { b: 2, a: 1 } },
	new Date(1234),
	/swr/,
];

function cacheTrace(
	initCache: typeof octane.initCache,
	createCacheHelper: typeof octane.createCacheHelper,
) {
	const provider = new Map();
	const context = initCache(provider)!;
	const [get, set, subscribe] = createCacheHelper(provider, 'key');
	const callbacks: unknown[] = [];
	const unsubscribe = subscribe('key', function (current, previous) {
		callbacks.push([current, previous]);
	});
	set({ data: 1 });
	set({ error: 'boom' });
	unsubscribe();
	set({ data: 2 });
	const result = { snapshot: get(), callbacks };
	context[3]?.();
	return result;
}

describe('SWR U2 React/Octane differential traces', () => {
	// @parity-case differential:cache-serialize
	it('matches the pinned serialization and config oracle', () => {
		for (const candidate of candidates) {
			expect(octane.serialize(candidate)).toEqual(reactSerialize(candidate));
			expect(octane.stableHash(candidate)).toEqual(reactStableHash(candidate));
		}
		const parent = { fallback: { a: 1 }, use: [vi.fn()] };
		const child = { fallback: { b: 2 }, use: [vi.fn()] };
		expect(octane.mergeConfigs(parent, child)).toEqual(reactMergeConfigs(parent, child));
	});

	// @parity-case differential:cache-trace
	it('matches cache snapshots and callback logs', () => {
		expect(cacheTrace(octane.initCache, octane.createCacheHelper)).toEqual(
			cacheTrace(reactInitCache, reactCreateCacheHelper),
		);
	});
});
