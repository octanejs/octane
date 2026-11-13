import { createDataHandler } from 'octane/data/server';
import * as Books from './books.data.ts';
import { stats } from './books.data.ts';

export const handler = createDataHandler({}, (handle, defineHandler) => [
	...defineHandler(Books, {
		list: () => [],
		stats: () => ({ total: 0 }),
		addBook: (input) => input,
		archive: () => ({ total: 0 }),
		changes: async function* () {},
	}),
	handle(stats, () => ({ total: 1 })),
]);
