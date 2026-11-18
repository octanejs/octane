import {
	createFamily,
	createScope,
	type DerivedSignal,
	type SignalFamily,
	type WritableSignal,
} from 'octane/signals';

const scope = createScope({ scopeKey: 'family-typetest' });

const row = createFamily(scope, (id: string) => scope.signal$(null, { id, done: false }));
const row$: WritableSignal<{ id: string; done: boolean }> = row.get('a');
row$.set((previous) => ({ ...previous, done: true }));
// @ts-expect-error Keys have the type create takes.
row.get(1);

const cell: SignalFamily<[number, number], DerivedSignal<number>> = createFamily(
	scope,
	([r, c]: [number, number]) => scope.derived$(null, () => r * c),
	{ keyOf: ([r, c]) => `${r}:${c}`, idle: 1000 },
);
const product: number = cell.get([2, 3]).get();
// @ts-expect-error A derived member is read-only.
cell.get([2, 3]).set(1);
const evicted: boolean = cell.delete([2, 3]);
const size: number = cell.size;
void product;
void evicted;
void size;

// @ts-expect-error keyOf takes the family's key type.
createFamily(scope, (id: string) => scope.signal$(null, id), { keyOf: (key: number) => key });
