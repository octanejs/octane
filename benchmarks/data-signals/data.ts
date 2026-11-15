/**
 * The data every lane reads: an octane/data store seeded with the reads a
 * scenario shows, so nothing loads during a timed step.
 */
import * as devalue from 'devalue';
import { createDataStore, read, type ReadHandle, type StandardSchema } from 'octane/data';

export interface Item {
	readonly id: string;
	readonly label: string;
}

const schema = <T>(check: (value: any) => boolean): StandardSchema<unknown, T> => ({
	'~standard': {
		version: 1,
		vendor: 'bench',
		validate: (value) =>
			check(value) ? { value: value as T } : { issues: [{ message: 'does not match' }] },
	},
});
const isItem = (value: any) => typeof value?.id === 'string' && typeof value.label === 'string';

// Kept for the session, so unmounting starts no retention timer in any lane.
export const item = read({
	name: 'item',
	input: schema<{ id: string }>((value) => typeof value?.id === 'string'),
	output: schema<Item>(isItem),
	fresh: Infinity,
	keep: Infinity,
});
export const items = read({
	name: 'items',
	output: schema<Item[]>((value) => Array.isArray(value)),
	fresh: Infinity,
	keep: Infinity,
});

export const idsOf = (count: number) => Array.from({ length: count }, (_, index) => `r${index}`);
export const initial = (ids: readonly string[]): Item[] =>
	ids.map((id) => ({ id, label: `item ${id}` }));

/** A store holding each item read, or the one list, already adopted. */
export function dataStore(ids: readonly string[], list: boolean) {
	const rows = initial(ids);
	const seed = devalue.stringify({
		reads: list
			? [{ name: items.name, input: undefined, age: 0, value: rows }]
			: rows.map((row) => ({ name: item.name, input: { id: row.id }, age: 0, value: row })),
		cursors: [],
	});
	const store = createDataStore({
		seed,
		transport: async () => {
			throw new Error('the benchmark never loads');
		},
	});
	const handles: Array<[string, ReadHandle<any>]> = list
		? [['items', store.read(items)]]
		: ids.map((id) => [id, store.read(item, { id })]);
	return { store, handles };
}
