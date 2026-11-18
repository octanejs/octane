import { createDataHandler } from 'octane/data/server';
import * as Books from './data-served.data.js';

const context = () => ({ shelf: [] as Books.BookRow[] });

// A context that provides what the functions need serves them; the rest take the object.
createDataHandler({ context }, (_, defineHandler) =>
	defineHandler(Books, { stats: (_, { shelf }) => ({ total: shelf.length }) }),
);

createDataHandler({ context }, (_, defineHandler) =>
	// @ts-expect-error `stats` has no function of its own
	defineHandler(Books),
);

createDataHandler({ context }, (_, defineHandler) =>
	defineHandler(Books, {
		stats: () => ({ total: 0 }),
		// @ts-expect-error a contract declared with its function takes no second one
		byId: () => ({ id: '1', title: 'Kindred' }),
	}),
);

createDataHandler({}, (_, defineHandler) =>
	// @ts-expect-error `byId` and `list` need a shelf this context lacks
	defineHandler(Books, { stats: () => ({ total: 0 }) }),
);
