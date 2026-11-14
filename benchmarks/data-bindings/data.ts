/**
 * The data both renderers read: `ROWS` items, as an octane/data store seeded
 * with every read (so nothing loads), and as a bare external store holding the
 * same values with one listener set per item and one for the list.
 */
import * as devalue from 'devalue';
import { createDataStore, entity, read, write, type StandardSchema } from 'octane/data';
import { ROWS } from './contract.mjs';

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
const Item = entity('item', schema<Item>(isItem));

export const item = read({
	name: 'item',
	input: schema<{ id: string }>((value) => typeof value?.id === 'string'),
	output: schema<Item>(isItem),
	entities: (value) => Item.from(value),
	fresh: Infinity,
});
export const items = read({
	name: 'items',
	output: schema<Item[]>((value) => Array.isArray(value)),
	entities: (list) => Item.from(list),
	fresh: Infinity,
});
export const setLabel = write({
	name: 'setLabel',
	input: schema<{ id: string; label: string }>((value) => typeof value?.label === 'string'),
	patches: Item,
});

export const ids = Array.from({ length: ROWS }, (_, index) => `r${index}`);
const initial = (): Item[] => ids.map((id) => ({ id, label: `item ${id}` }));

/** An octane/data store holding every item read and the list, with nothing to load. */
export function dataStore() {
	const rows = initial();
	const server = new Map(rows.map((row) => [row.id, row]));
	const seed = devalue.stringify({
		reads: [
			{ name: items.name, input: undefined, age: 0, value: rows },
			...rows.map((row) => ({ name: item.name, input: { id: row.id }, age: 0, value: row })),
		],
		cursors: [],
	});
	const store = createDataStore({
		seed,
		// A confirmed write reloads the reads it touched; the server answers from its rows.
		transport: async (request) => {
			if (request.kind === 'write') {
				const { id, label } = request.input as Item;
				server.set(id, { id, label });
				return { ok: true, value: null };
			}
			if (request.name === items.name) return { ok: true, value: [...server.values()] };
			return { ok: true, value: server.get((request.input as { id: string }).id) };
		},
	});
	// Adopt every seeded read outside the timed steps.
	store.read(items);
	for (const id of ids) store.read(item, { id });
	return store;
}

/** The same values as a bare external store: one snapshot and listener set per item, and the list. */
export function bareStore() {
	let list = initial();
	const byId = new Map(list.map((row) => [row.id, row]));
	const listeners = new Map<string, Set<() => void>>();
	const listenersOf = (key: string) => {
		let set = listeners.get(key);
		if (!set) listeners.set(key, (set = new Set()));
		return set;
	};
	const subscribers = new Map<string, (notify: () => void) => () => void>();
	const getters = new Map<string, () => unknown>();
	const LIST = '\0list';
	for (const key of [LIST, ...ids]) {
		subscribers.set(key, (notify) => {
			listenersOf(key).add(notify);
			return () => listenersOf(key).delete(notify);
		});
		getters.set(key, key === LIST ? () => list : () => byId.get(key));
	}
	return {
		LIST,
		subscribe: (key: string) => subscribers.get(key)!,
		get: (key: string) => getters.get(key)!,
		setLabel(id: string, label: string) {
			const next = { id, label };
			byId.set(id, next);
			list = list.map((row) => (row.id === id ? next : row));
			for (const key of [id, LIST]) for (const notify of [...listenersOf(key)]) notify();
		},
		listeners: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
	};
}
