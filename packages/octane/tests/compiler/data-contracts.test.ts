import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeDataContracts } from '../../src/compiler/data-contracts.js';

const FIXTURES = join(import.meta.dirname, '_fixtures/data-contracts');

function codes(source: string, filename: string) {
	return analyzeDataContracts(source, filename).diagnostics.map(
		(diagnostic) => `${diagnostic.code}:${diagnostic.start.line}`,
	);
}

const contracts = `import { z } from 'zod';
import { entity, read, write } from 'octane/data';
export const Book = entity('book', z.object({ id: z.string() }));
export const stats = read({ name: 'books.stats', output: z.object({ total: z.number() }) });
export const addBook = write({ name: 'books.add', input: z.object({}), creates: Book });
export const setRead = write({ name: 'books.setRead', input: z.object({}), patches: Book });
`;

describe('data contract check', () => {
	it('passes the shelf contracts and server handler', () => {
		const shelf = analyzeDataContracts(
			readFileSync(join(FIXTURES, 'shelf.data.ts'), 'utf8'),
			'/app/shelf.data.ts',
		);
		expect(shelf.diagnostics).toEqual([]);
		expect(
			shelf.declarations.map((declaration) => [declaration.binding, declaration.name]),
		).toEqual([
			['Book', 'book'],
			['books', 'books.list'],
			['finished', 'books.finished'],
			['unread', 'books.unread'],
			['stats', 'books.stats'],
			['addBook', 'books.add'],
			['setRead', 'books.setRead'],
			['removeBook', 'books.remove'],
			['receipt', 'books.receipt'],
			['shelfChanges', 'books.changes'],
		]);

		const server = analyzeDataContracts(
			readFileSync(join(FIXTURES, 'server.ts'), 'utf8'),
			'/app/server.ts',
		);
		expect(server.diagnostics).toEqual([]);
		// The loop over [books, finished, unread] handles each view.
		expect(server.uses.map((use) => `${use.imported}@${use.site}`)).toEqual([
			'books@handle',
			'finished@handle',
			'unread@handle',
			'stats@handle',
			'addBook@handle',
			'setRead@handle',
			'removeBook@handle',
			'receipt@handle',
			'shelfChanges@handle',
		]);
		expect(server.uses[0]).toMatchObject({ source: './shelf.data.ts', binding: 'books' });
	});

	it.each([
		['.ts', 'page.ts'],
		['.tsx', 'page.tsx'],
		['.js', 'page.js'],
		['.tsrx', 'page.tsrx'],
	])('finds use sites by name in %s, whatever the receiver', (_, file) => {
		const source = `import * as data from './books.data.ts';
import { addBook, setRead, stats } from './books.data.ts';
import { useForm as form } from 'octane/data/octane';
export function save(session, flag) {
	session.current.store.write(setRead, { id: '1', read: flag });
	stream.write('not a contract');
	form(addBook);
	return getStore().read(stats).value + data.stats.name;
}
for (const contract of [addBook, setRead]) session.store.form(contract);
`;
		const { diagnostics, uses } = analyzeDataContracts(source, `/app/${file}`);
		expect(diagnostics).toEqual([]);
		expect(uses.map((use) => `${use.binding}@${use.site}`)).toEqual([
			'setRead@write',
			'addBook@useForm',
			'stats@read',
			'addBook@form',
			'setRead@form',
		]);
	});

	it('accepts type positions, property reads, and exports', () => {
		const source = `import { setRead, type Book } from './books.data.ts';
export type Input = typeof setRead extends { input: infer I } ? I : never;
export const label = setRead.name;
export { setRead };
`;
		expect(codes(source, '/app/page.ts')).toEqual([]);
	});

	// Rule 1.
	it('reports a contract built at runtime, unexported, or without a literal name', () => {
		const source = `import { read, write } from 'octane/data';
export const byShelf = (id: string) => read({ name: \`shelf.\${id}\`, output });
const hidden = write({ name: 'books.hidden', input });
export let later = write({ name: 'books.later', input });
const base = { name: 'books.spread', input };
export const spread = write({ ...base });
export const twice = write({ name: 'books.later', input });
`;
		expect(codes(source, '/app/books.data.ts')).toEqual([
			'OCTANE_DATA_CONTRACT_DECLARATION:2',
			'OCTANE_DATA_CONTRACT_DECLARATION:3',
			'OCTANE_DATA_CONTRACT_MODULE:4',
			'OCTANE_DATA_CONTRACT_DECLARATION:4',
			'OCTANE_DATA_CONTRACT_DECLARATION:6',
			'OCTANE_DATA_CONTRACT_DECLARATION:7',
		]);
	});

	// Rule 2.
	it('keeps contracts in inert *.data.ts modules', () => {
		expect(codes(contracts, '/app/contracts.ts')).toEqual([
			'OCTANE_DATA_CONTRACT_MODULE:3',
			'OCTANE_DATA_CONTRACT_MODULE:4',
			'OCTANE_DATA_CONTRACT_MODULE:5',
			'OCTANE_DATA_CONTRACT_MODULE:6',
		]);
		expect(codes(contracts, '/app/books.data.ts')).toEqual([]);
		const effects = `${contracts}import { handler } from 'octane/data/server';
console.log(stats);
if (import.meta.env) globalThis.ready = true;
function helper() {}
`;
		expect(codes(effects, '/app/books.data.ts')).toEqual([
			'OCTANE_DATA_CONTRACT_MODULE:7',
			'OCTANE_DATA_CONTRACT_MODULE:8',
			'OCTANE_DATA_CONTRACT_ESCAPE:8',
			'OCTANE_DATA_CONTRACT_MODULE:9',
			'OCTANE_DATA_CONTRACT_MODULE:10',
		]);
	});

	// Rule 3.
	it('reports a contract argument chosen at runtime', () => {
		const source = `import * as books from './books.data.ts';
import { addBook, setRead } from './books.data.ts';
import { useForm } from 'octane/data/react';
export function edit(store, book, name) {
	store.write(book.read ? addBook : setRead, { id: book.id });
	store.write(books[name], {});
	useForm(setRead ?? addBook);
}
`;
		expect(codes(source, '/app/page.tsx')).toEqual([
			'OCTANE_DATA_CONTRACT_ARGUMENT:5',
			'OCTANE_DATA_CONTRACT_ARGUMENT:6',
			'OCTANE_DATA_CONTRACT_ARGUMENT:7',
		]);
	});

	// Rule 4.
	it('reports a contract that escapes to a helper, a variable, or a list', () => {
		const source = `import * as books from './books.data.ts';
import { setRead, stats } from './books.data.ts';
const toggle = makeToggle(setRead);
const chosen = stats;
const all = [setRead, stats];
const named = Object.values(books);
export function Row() @{
	<Toggle contract={books.setRead} />
}
`;
		expect(codes(source, '/app/page.tsrx')).toEqual([
			'OCTANE_DATA_CONTRACT_ESCAPE:3',
			'OCTANE_DATA_CONTRACT_ESCAPE:4',
			'OCTANE_DATA_CONTRACT_ESCAPE:5',
			'OCTANE_DATA_CONTRACT_ESCAPE:5',
			'OCTANE_DATA_CONTRACT_ESCAPE:6',
			'OCTANE_DATA_CONTRACT_ESCAPE:8',
		]);
	});

	it('limits a loop alias to sites and property reads', () => {
		const source = `import { books, finished } from './books.data.ts';
export const handlers = [books, finished].map((list) => remember(list));
for (const list of [books, finished]) cache.set(list.name, list);
`;
		expect(codes(source, '/app/server.ts')).toEqual([
			'OCTANE_DATA_CONTRACT_ESCAPE:2',
			'OCTANE_DATA_CONTRACT_ESCAPE:3',
		]);
	});
});
