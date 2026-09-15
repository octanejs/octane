import { describe, expect, it, vi } from 'vitest';

import { renderHook } from '@octanejs/testing-library';
import { createCollection, createLiveQueryCollection } from '@tanstack/db';
import { useLiveQuery } from '../src/useLiveQuery';
import { mockSyncCollectionOptions } from './db-fixtures/utils';
import type * as OctaneNS from 'octane';

// Intercept octane.useSyncExternalStore so we can capture the `subscribe`
// callback that `useLiveQuery` registers and assert that it does not invoke
// `onStoreChange` synchronously when the collection is already ready.
let capturedSubscribe: ((cb: () => void) => () => void) | null = null;

vi.mock('octane', async () => {
	const actual = await vi.importActual<typeof OctaneNS>('octane');
	return {
		...actual,
		useSyncExternalStore: (subscribe: any, getSnapshot: any) => {
			capturedSubscribe = subscribe;
			return getSnapshot();
		},
	};
});

type Person = { id: string; name: string; age: number };

const initialPersons: Array<Person> = [
	{ id: `1`, name: `A`, age: 10 },
	{ id: `2`, name: `B`, age: 20 },
];

describe(`useLiveQuery: eager onStoreChange must not fire synchronously during subscribe`, () => {
	it(`notifies for real deltas without a redundant initial wake-up`, async () => {
		const base = createCollection(
			mockSyncCollectionOptions<Person>({
				id: `eager-onstorechange-persons`,
				getKey: (p) => p.id,
				initialData: initialPersons,
			}),
		);

		const lqc = createLiveQueryCollection({
			startSync: true,
			query: (q) => q.from({ persons: base }),
		});
		await lqc.preload();
		expect(lqc.status).toBe(`ready`);

		capturedSubscribe = null;
		renderHook(() => useLiveQuery(lqc));
		expect(capturedSubscribe).toBeTypeOf(`function`);

		const onStoreChange = vi.fn();
		const unsub = capturedSubscribe!(onStoreChange);

		// The external-store hook re-reads after subscribing. An unchanged ready
		// collection does not need a redundant synchronous or deferred wake-up.
		expect(onStoreChange).not.toHaveBeenCalled();
		await Promise.resolve();
		expect(onStoreChange).not.toHaveBeenCalled();

		base.utils.begin();
		base.utils.write({
			type: `insert`,
			value: { id: `3`, name: `C`, age: 30 },
		});
		base.utils.commit();
		await Promise.resolve();
		expect(onStoreChange).toHaveBeenCalled();

		unsub();
	});
});
