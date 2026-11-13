import type { DataStore } from 'octane/data';
import { addBook, bookShape, list, stats } from './books.data.ts';
import { orphan } from './extra.data.ts';

export const shape = bookShape;

export function load(store: DataStore) {
	store.read(list);
	store.read(stats);
	store.write(addBook, { id: '1', title: 'Kindred' });
	store.write(orphan, { id: '1' });
}
