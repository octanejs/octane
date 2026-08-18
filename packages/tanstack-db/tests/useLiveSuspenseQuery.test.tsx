import { describe, expect, it } from 'vitest';
import { render, renderHook, waitFor } from '@octanejs/testing-library';
import { createCollection, createLiveQueryCollection, eq, gt } from '@tanstack/db';
import { Suspense } from 'octane';
import { useLiveSuspenseQuery } from '../src/useLiveSuspenseQuery';
import { mockSyncCollectionOptions } from './db-fixtures/utils';

type ChildrenProps = { children: unknown };

type Person = {
	id: string;
	name: string;
	age: number;
	email: string;
	isActive: boolean;
	team: string;
};

const initialPersons: Array<Person> = [
	{
		id: `1`,
		name: `John Doe`,
		age: 30,
		email: `john.doe@example.com`,
		isActive: true,
		team: `team1`,
	},
	{
		id: `2`,
		name: `Jane Doe`,
		age: 25,
		email: `jane.doe@example.com`,
		isActive: true,
		team: `team2`,
	},
	{
		id: `3`,
		name: `John Smith`,
		age: 35,
		email: `john.smith@example.com`,
		isActive: true,
		team: `team1`,
	},
];

// Wrapper component with Suspense
function SuspenseWrapper({ children }: ChildrenProps) {
	return <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>;
}

describe(`useLiveSuspenseQuery`, () => {
	it(`renders an already-ready collection without flashing the fallback`, async () => {
		// Regression for the ready-path `use()` sentinel. On the non-loading paths
		// the hook hands `use()` a shared settled thenable so its call-order index
		// stays stable without suspending. That thenable must already carry
		// `status: 'fulfilled'`: `use()` tags an untagged thenable `'pending'`
		// synchronously (its fulfillment runs a microtask later), so a bare
		// `Promise.resolve()` would suspend on first use and flash the fallback even
		// though data is ready. Preloading the collection to `ready` before mount
		// makes the very first render take the ready path, exercising the sentinel
		// directly. This is placed first so it is the process-global first use.
		const base = createCollection(
			mockSyncCollectionOptions<Person>({
				id: `test-persons-suspense-no-flash`,
				getKey: (person: Person) => person.id,
				initialData: initialPersons,
			}),
		);
		const liveQuery = createLiveQueryCollection((q) => q.from({ persons: base }));
		await liveQuery.preload();
		expect(liveQuery.status).toBe(`ready`);

		let fallbackRendered = false;
		const List = () => {
			const { data } = useLiveSuspenseQuery(liveQuery);
			return <div>ready:{String(data.length)}</div>;
		};
		const App = () => (
			<Suspense
				fallback={
					<div>
						{(() => {
							fallbackRendered = true;
							return `Loading...`;
						})()}
					</div>
				}
			>
				<List />
			</Suspense>
		);

		const { container } = render(<App />);

		// A ready collection must render on the first commit without suspending.
		// Pre-fix (bare `Promise.resolve()`), the first `use()` suspended, so the
		// fallback rendered and `container` showed `Loading...` here.
		expect(container.textContent).toContain(`ready:3`);
		expect(fallbackRendered).toBe(false);
	});

	it(`should suspend while loading and return data when ready`, async () => {
		const collection = createCollection(
			mockSyncCollectionOptions<Person>({
				id: `test-persons-suspense-1`,
				getKey: (person: Person) => person.id,
				initialData: initialPersons,
			}),
		);

		const { result } = renderHook(
			() => {
				return useLiveSuspenseQuery((q) =>
					q
						.from({ persons: collection })
						.where(({ persons }) => gt(persons.age, 30))
						.select(({ persons }) => ({
							id: persons.id,
							name: persons.name,
							age: persons.age,
						})),
				);
			},
			{
				wrapper: SuspenseWrapper,
			},
		);

		// Wait for data to load
		await waitFor(() => {
			expect(result.current.state.size).toBe(1);
		});

		expect(result.current.data).toHaveLength(1);
		const johnSmith = result.current.data[0];
		expect(johnSmith).toMatchObject({
			id: `3`,
			name: `John Smith`,
			age: 35,
		});
	});

	it(`should return data that is always defined (type-safe)`, async () => {
		const collection = createCollection(
			mockSyncCollectionOptions<Person>({
				id: `test-persons-suspense-2`,
				getKey: (person: Person) => person.id,
				initialData: initialPersons,
			}),
		);

		const { result } = renderHook(
			() => {
				return useLiveSuspenseQuery((q) => q.from({ persons: collection }));
			},
			{
				wrapper: SuspenseWrapper,
			},
		);

		await waitFor(() => {
			expect(result.current.data).toBeDefined();
		});

		// Data is always defined - no optional chaining needed
		expect(result.current.data.length).toBe(3);
		// TypeScript will guarantee data is Array<Person>, not Array<Person> | undefined
	});

	it(`should work with single result queries`, async () => {
		const collection = createCollection(
			mockSyncCollectionOptions<Person>({
				id: `test-persons-suspense-3`,
				getKey: (person: Person) => person.id,
				initialData: initialPersons,
			}),
		);

		const { result } = renderHook(
			() => {
				return useLiveSuspenseQuery((q) =>
					q
						.from({ collection })
						.where(({ collection: c }) => eq(c.id, `3`))
						.findOne(),
				);
			},
			{
				wrapper: SuspenseWrapper,
			},
		);

		await waitFor(() => {
			expect(result.current.state.size).toBe(1);
		});

		expect(result.current.data).toMatchObject({
			id: `3`,
			name: `John Smith`,
			age: 35,
		});
	});

	it(`should work with pre-created live query collection`, async () => {
		const collection = createCollection(
			mockSyncCollectionOptions<Person>({
				id: `test-persons-suspense-4`,
				getKey: (person: Person) => person.id,
				initialData: initialPersons,
			}),
		);

		const liveQuery = createLiveQueryCollection((q) =>
			q.from({ persons: collection }).where(({ persons }) => gt(persons.age, 30)),
		);

		const { result } = renderHook(() => useLiveSuspenseQuery(liveQuery), {
			wrapper: SuspenseWrapper,
		});

		await waitFor(() => {
			expect(result.current.data).toHaveLength(1);
		});

		expect(result.current.data[0]).toMatchObject({
			id: `3`,
			name: `John Smith`,
			age: 35,
		});
	});

	it(`should re-suspend when deps change`, async () => {
		const collection = createCollection(
			mockSyncCollectionOptions<Person>({
				id: `test-persons-suspense-5`,
				getKey: (person: Person) => person.id,
				initialData: initialPersons,
			}),
		);

		const { result, rerender } = renderHook(
			({ minAge }) => {
				return useLiveSuspenseQuery(
					(q) => q.from({ persons: collection }).where(({ persons }) => gt(persons.age, minAge)),
					[minAge],
				);
			},
			{
				wrapper: SuspenseWrapper,
				initialProps: { minAge: 30 },
			},
		);

		// Initial load - age > 30
		await waitFor(() => {
			expect(result.current.data).toHaveLength(1);
		});
		expect(result.current.data[0]?.age).toBe(35);

		// Change deps - age > 20
		rerender({ minAge: 20 });

		// Should re-suspend and load new data
		await waitFor(() => {
			expect(result.current.data).toHaveLength(3);
		});
	});

	it(`should reactively update data after initial load`, async () => {
		const collection = createCollection(
			mockSyncCollectionOptions<Person>({
				id: `test-persons-suspense-6`,
				getKey: (person: Person) => person.id,
				initialData: initialPersons,
			}),
		);

		const { result } = renderHook(
			() => useLiveSuspenseQuery((q) => q.from({ persons: collection })),
			{
				wrapper: SuspenseWrapper,
			},
		);

		// Wait for initial data
		await waitFor(() => {
			expect(result.current.data).toHaveLength(3);
		});

		// Insert new person
		collection.insert({
			id: `4`,
			name: `New Person`,
			age: 40,
			email: `new@example.com`,
			isActive: true,
			team: `team1`,
		});

		// Should reactively update
		await waitFor(() => {
			expect(result.current.data).toHaveLength(4);
		});
	});

	it(`should throw error when query function returns undefined`, () => {
		expect(() => {
			renderHook(
				() => {
					return useLiveSuspenseQuery(() => undefined as any);
				},
				{
					wrapper: SuspenseWrapper,
				},
			);
		}).toThrow(/does not support disabled queries/);
	});

	it(`should work with config object`, async () => {
		const collection = createCollection(
			mockSyncCollectionOptions<Person>({
				id: `test-persons-suspense-7`,
				getKey: (person: Person) => person.id,
				initialData: initialPersons,
			}),
		);

		const { result } = renderHook(
			() => {
				return useLiveSuspenseQuery({
					query: (q) => q.from({ persons: collection }),
				});
			},
			{
				wrapper: SuspenseWrapper,
			},
		);

		await waitFor(() => {
			expect(result.current.data).toHaveLength(3);
		});
	});

	it(`should keep stable data references when data hasn't changed`, async () => {
		const collection = createCollection(
			mockSyncCollectionOptions<Person>({
				id: `test-persons-suspense-8`,
				getKey: (person: Person) => person.id,
				initialData: initialPersons,
			}),
		);

		const { result, rerender } = renderHook(
			() => useLiveSuspenseQuery((q) => q.from({ persons: collection })),
			{
				wrapper: SuspenseWrapper,
			},
		);

		await waitFor(() => {
			expect(result.current.data).toHaveLength(3);
		});

		const data1 = result.current.data;

		rerender();

		const data2 = result.current.data;

		// Data objects should be stable
		expect(data1[0]).toBe(data2[0]);
		expect(data1[1]).toBe(data2[1]);
		expect(data1[2]).toBe(data2[2]);
	});

	it(`should handle multiple queries in same component (serial execution)`, async () => {
		const personsCollection = createCollection(
			mockSyncCollectionOptions<Person>({
				id: `test-persons-suspense-9`,
				getKey: (person: Person) => person.id,
				initialData: initialPersons,
			}),
		);

		const { result } = renderHook(
			() => {
				const persons = useLiveSuspenseQuery((q) => q.from({ persons: personsCollection }));
				const johnDoe = useLiveSuspenseQuery((q) =>
					q
						.from({ persons: personsCollection })
						.where(({ persons: p }) => eq(p.id, `1`))
						.findOne(),
				);
				return { persons, johnDoe };
			},
			{
				wrapper: SuspenseWrapper,
			},
		);

		await waitFor(() => {
			expect(result.current.persons.data).toHaveLength(3);
			expect(result.current.johnDoe.data).toBeDefined();
		});

		expect(result.current.johnDoe.data).toMatchObject({
			id: `1`,
			name: `John Doe`,
		});
	});

	it(`should cleanup collection when unmounted`, async () => {
		const collection = createCollection(
			mockSyncCollectionOptions<Person>({
				id: `test-persons-suspense-10`,
				getKey: (person: Person) => person.id,
				initialData: initialPersons,
			}),
		);

		const { result, unmount } = renderHook(
			() => useLiveSuspenseQuery((q) => q.from({ persons: collection })),
			{
				wrapper: SuspenseWrapper,
			},
		);

		await waitFor(() => {
			expect(result.current.data).toHaveLength(3);
		});

		const liveQueryCollection = result.current.collection;
		expect(liveQueryCollection.subscriberCount).toBeGreaterThan(0);

		unmount();

		// Collection should eventually be cleaned up (gcTime is 1ms)
		await waitFor(
			() => {
				expect(liveQueryCollection.status).toBe(`cleaned-up`);
			},
			{ timeout: 1000 },
		);
	});

	it(`should NOT re-suspend on live updates after initial load`, async () => {
		const collection = createCollection(
			mockSyncCollectionOptions<Person>({
				id: `test-persons-suspense-11`,
				getKey: (person: Person) => person.id,
				initialData: initialPersons,
			}),
		);

		let suspenseCount = 0;
		const SuspenseCounter = ({ children }: ChildrenProps) => {
			return (
				<Suspense
					fallback={
						<div>
							{(() => {
								suspenseCount++;
								return `Loading...`;
							})()}
						</div>
					}
				>
					{children}
				</Suspense>
			);
		};

		const { result } = renderHook(
			() => useLiveSuspenseQuery((q) => q.from({ persons: collection })),
			{
				wrapper: SuspenseCounter,
			},
		);

		// Wait for initial load
		await waitFor(() => {
			expect(result.current.data).toHaveLength(3);
		});

		const initialSuspenseCount = suspenseCount;

		// Make multiple live updates
		collection.insert({
			id: `4`,
			name: `New Person 1`,
			age: 40,
			email: `new1@example.com`,
			isActive: true,
			team: `team1`,
		});

		await waitFor(() => {
			expect(result.current.data).toHaveLength(4);
		});

		collection.insert({
			id: `5`,
			name: `New Person 2`,
			age: 45,
			email: `new2@example.com`,
			isActive: true,
			team: `team2`,
		});

		await waitFor(() => {
			expect(result.current.data).toHaveLength(5);
		});

		collection.delete(`4`);

		await waitFor(() => {
			expect(result.current.data).toHaveLength(4);
		});

		// Verify suspense count hasn't increased (no re-suspension)
		expect(suspenseCount).toBe(initialSuspenseCount);
	});

	it(`should only suspend on deps change, not on every re-render`, async () => {
		const collection = createCollection(
			mockSyncCollectionOptions<Person>({
				id: `test-persons-suspense-12`,
				getKey: (person: Person) => person.id,
				initialData: initialPersons,
			}),
		);

		const { result, rerender } = renderHook(
			({ minAge }) =>
				useLiveSuspenseQuery(
					(q) => q.from({ persons: collection }).where(({ persons }) => gt(persons.age, minAge)),
					[minAge],
				),
			{
				wrapper: SuspenseWrapper,
				initialProps: { minAge: 20 },
			},
		);

		// Wait for initial load
		await waitFor(() => {
			expect(result.current.data).toHaveLength(3);
		});

		const dataAfterInitial = result.current.data;

		// Re-render with SAME deps - should NOT suspend (data stays available)
		rerender({ minAge: 20 });
		expect(result.current.data).toHaveLength(3);
		expect(result.current.data).toBe(dataAfterInitial);

		rerender({ minAge: 20 });
		expect(result.current.data).toHaveLength(3);

		rerender({ minAge: 20 });
		expect(result.current.data).toHaveLength(3);

		// Change deps - SHOULD suspend and get new data
		rerender({ minAge: 30 });

		await waitFor(() => {
			expect(result.current.data).toHaveLength(1);
		});

		expect(result.current.data[0]?.age).toBe(35);
	});

	it(`should work with pre-created SingleResult collection`, async () => {
		const collection = createCollection(
			mockSyncCollectionOptions<Person>({
				id: `test-persons-suspense-single`,
				getKey: (person: Person) => person.id,
				initialData: initialPersons,
			}),
		);

		// Pre-create a SingleResult live query collection
		const singlePersonQuery = createLiveQueryCollection((q) =>
			q
				.from({ persons: collection })
				.where(({ persons }) => eq(persons.id, `1`))
				.findOne(),
		);

		const { result } = renderHook(() => useLiveSuspenseQuery(singlePersonQuery), {
			wrapper: SuspenseWrapper,
		});

		await waitFor(() => {
			expect(result.current.data).toBeDefined();
		});

		expect(result.current.data).toMatchObject({
			id: `1`,
			name: `John Doe`,
			age: 30,
		});
	});

	// OCTANE DIVERGENCE: the upstream `StrictMode double-invocation` case is NOT
	// APPLICABLE. Octane has no StrictMode development double-invoke of component
	// setup/cleanup, so there is no double-invocation behavior to assert. Recorded
	// as not-applicable in UPSTREAM.md and audit/test-classifications.json rather
	// than committed as a skipped test (which the committed-test-marker gate
	// forbids).

	it(`renders the Suspense fallback while an async collection loads, then the data`, async () => {
		// Regression for the raw-promise-throw bug. Octane Suspense only recognizes
		// the sentinel from `use(thenable)`; the pre-fix `throw promiseRef.current`
		// reached Octane's error path, so the fallback never rendered. Every other
		// suspense test uses a synchronous fixture that is already `ready` at first
		// render, so none of them exercises the suspend path. This one gates the
		// collection's readiness behind a promise so the hook must actually suspend.
		let releaseLoad: (() => void) | null = null;
		const loadGate = new Promise<void>((resolve) => {
			releaseLoad = resolve;
		});
		const collection = createCollection<Person>({
			id: `suspense-async-fallback`,
			getKey: (person) => person.id,
			sync: {
				sync: ({ begin, write, commit, markReady }) => {
					// Stay in `loading` until the gate resolves; only then publish rows
					// and mark ready. Until that happens the live query suspends.
					void loadGate.then(() => {
						begin();
						for (const person of initialPersons) write({ type: `insert`, value: person });
						commit();
						markReady();
					});
				},
			},
		});

		const List = () => {
			const { data } = useLiveSuspenseQuery((q) => q.from({ persons: collection }));
			return <div>ready:{String(data.length)}</div>;
		};
		const App = () => (
			<Suspense fallback={<div>Loading...</div>}>
				<List />
			</Suspense>
		);

		const { container } = render(<App />);

		// The fallback must be in the DOM while the collection loads. With the raw
		// `throw promise`, this assertion fails (the error path runs instead).
		await waitFor(() => {
			expect(container.textContent).toContain(`Loading...`);
		});
		expect(container.textContent).not.toContain(`ready:`);

		// Resolve the load; the suspended content replaces the fallback.
		releaseLoad!();
		await waitFor(() => {
			expect(container.textContent).toContain(`ready:3`);
		});
		expect(container.textContent).not.toContain(`Loading...`);
	});

	it(`keeps a later sibling suspended when an earlier query resolves first`, async () => {
		// Regression for the positional-`use()` bug. Octane keys `use(thenable)` by
		// dynamic call-order index (not by compiler slot), so if the first
		// `useLiveSuspenseQuery` stops calling `use()` once it is ready, the second
		// hook's `use()` shifts onto the first's now-fulfilled thenable slot and
		// stops suspending — surfacing its still-loading collection as ready. Two
		// independently gated collections let the first resolve while the second is
		// still loading, which is exactly the window that triggers the shift.
		const gate = (id: string) => {
			let release: (() => void) | null = null;
			const opened = new Promise<void>((resolve) => {
				release = resolve;
			});
			const collection = createCollection<Person>({
				id,
				getKey: (person) => person.id,
				sync: {
					sync: ({ begin, write, commit, markReady }) => {
						void opened.then(() => {
							begin();
							for (const person of initialPersons) write({ type: `insert`, value: person });
							commit();
							markReady();
						});
					},
				},
			});
			return { collection, release: () => release!() };
		};

		const first = gate(`suspense-sibling-first`);
		const second = gate(`suspense-sibling-second`);

		const Pair = () => {
			const a = useLiveSuspenseQuery((q) => q.from({ persons: first.collection }));
			const b = useLiveSuspenseQuery((q) => q.from({ persons: second.collection }));
			return (
				<div>
					a:{String(a.data.length)}|b:{String(b.data.length)}
				</div>
			);
		};
		const App = () => (
			<Suspense fallback={<div>Loading...</div>}>
				<Pair />
			</Suspense>
		);

		const { container } = render(<App />);

		await waitFor(() => {
			expect(container.textContent).toContain(`Loading...`);
		});

		// Release ONLY the first collection. The second is still loading, so the
		// component must stay on the fallback. Pre-fix, the second hook read the
		// first's fulfilled thenable and rendered `a:3|b:0` here.
		first.release();
		await waitFor(() => {
			expect(first.collection.status).toBe(`ready`);
		});
		expect(container.textContent).toContain(`Loading...`);
		expect(container.textContent).not.toContain(`b:`);

		// Release the second collection; now both are ready and the pair renders.
		second.release();
		await waitFor(() => {
			expect(container.textContent).toContain(`a:3|b:3`);
		});
		expect(container.textContent).not.toContain(`Loading...`);
	});

	it(`should not re-suspend after hasBeenReady when isLoadingSubset changes`, async () => {
		// This test verifies that after the initial ready state is reached,
		// subsequent isLoadingSubset changes don't cause re-suspension
		// (stale-while-revalidate behavior, matching TanStack Query)

		const collection = createCollection(
			mockSyncCollectionOptions<Person>({
				id: `test-persons-suspense-on-demand`,
				getKey: (person: Person) => person.id,
				initialData: initialPersons,
			}),
		);

		let suspenseCount = 0;

		const SuspenseTracker = ({ children }: ChildrenProps) => {
			return (
				<Suspense
					fallback={
						<div>
							{(() => {
								suspenseCount++;
								return `Loading...`;
							})()}
						</div>
					}
				>
					{children}
				</Suspense>
			);
		};

		const { result } = renderHook(
			() => {
				return useLiveSuspenseQuery((q) => q.from({ persons: collection }));
			},
			{
				wrapper: SuspenseTracker,
			},
		);

		// Wait for initial load
		await waitFor(() => {
			expect(result.current.data).toHaveLength(3);
		});

		const initialSuspenseCount = suspenseCount;

		// Now simulate on-demand loading by tracking a load promise on the live query collection
		// This mimics what happens when a new subset query is made in on-demand mode
		let resolveLoadPromise: () => void;
		const loadPromise = new Promise<void>((resolve) => {
			resolveLoadPromise = resolve;
		});

		// Track the load promise on the LIVE QUERY collection - this sets isLoadingSubset = true
		result.current.collection._sync.trackLoadPromise(loadPromise);

		// Verify isLoadingSubset is now true on the live query collection
		expect(result.current.collection.isLoadingSubset).toBe(true);

		// The collection is still ready, but isLoadingSubset is true
		expect(result.current.collection.status).toBe(`ready`);

		// Resolve the load promise to simulate data loading complete
		resolveLoadPromise!();

		// Wait for the loadingSubset:change event to propagate
		await waitFor(() => {
			expect(result.current.collection.isLoadingSubset).toBe(false);
		});

		// After hasBeenReadyRef is set, subsequent isLoadingSubset changes
		// should NOT cause re-suspension (stale-while-revalidate behavior)
		expect(suspenseCount).toBe(initialSuspenseCount);

		// Data should still be available
		expect(result.current.data).toHaveLength(3);
	});
});
