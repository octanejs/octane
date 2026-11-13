import { createDataHandler } from 'octane/data/server';
import * as Books from './data-define-handler.data.js';

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
declare function expectType<T extends true>(): void;

const row = { id: '1', title: 'Kindred' };
const context = () => ({ shelf: [row] });

// Every contract export needs an implementation, typed by its contract and the context.
createDataHandler({ context }, (handle, defineHandler) => [
	handle(Books.stats, () => ({ total: 0 })),
	...defineHandler(Books, {
		stats: (input, call) => {
			expectType<Equal<typeof input, void>>();
			expectType<Equal<typeof call.shelf, { id: string; title: string }[]>>();
			expectType<Equal<typeof call.operationId, string>>();
			return { total: call.shelf.length };
		},
		byId: async (input) => {
			expectType<Equal<typeof input, { id: string }>>();
			return row;
		},
		list: (input, { shelf }) => {
			expectType<Equal<typeof input.offset, number>>();
			expectType<Equal<typeof input.limit, number>>();
			return shelf.slice(input.offset, input.offset + input.limit);
		},
		search: (input) => {
			expectType<Equal<typeof input.q, string>>();
			expectType<Equal<typeof input.limit, number>>();
			return [row];
		},
		addBook: (input, { operationId }) => ({ id: operationId, title: input.title }),
		changes: async function* (params, { cursor }) {
			expectType<Equal<typeof params, { room: string }>>();
			expectType<Equal<typeof cursor, string | null>>();
			yield { event: row, cursor: '1' };
		},
	}),
]);

createDataHandler({}, (_, defineHandler) =>
	// @ts-expect-error a contract without an implementation
	defineHandler(Books, {
		stats: () => ({ total: 0 }),
		byId: () => row,
		list: () => [],
		search: () => [],
		changes: async function* () {},
	}),
);

createDataHandler({}, (_, defineHandler) =>
	defineHandler(Books, {
		stats: () => ({ total: 0 }),
		byId: () => row,
		list: () => [],
		search: () => [],
		addBook: () => row,
		changes: async function* () {},
		// @ts-expect-error a key that names no contract: entities, schemas and constants need none
		Book: () => row,
	}),
);

createDataHandler({}, (_, defineHandler) =>
	defineHandler(Books, {
		// @ts-expect-error a misspelled key
		stat: () => ({ total: 0 }),
		byId: () => row,
		list: () => [],
		search: () => [],
		addBook: () => row,
		changes: async function* () {},
	}),
);

createDataHandler({}, (_, defineHandler) =>
	defineHandler(Books, {
		stats: () => ({ total: 0 }),
		// @ts-expect-error the output must match the contract
		byId: () => ({ id: 1 }),
		list: () => [],
		search: () => [],
		// @ts-expect-error a write's input is its contract's
		addBook: (input: { name: string }) => row,
		changes: async function* () {},
	}),
);
