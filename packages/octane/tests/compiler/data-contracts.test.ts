import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	analyzeDataContracts,
	createDataProgram,
	formatDataDiagnostic,
} from '../../src/compiler/data-contracts.js';

type Diagnostic = { code: string; start: { line: number } };

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

	it('sees through type assertions and optional calls', () => {
		const declaration = `import { write } from 'octane/data';
export const tagged = write({ name: 'books.tagged', input }) satisfies Contract;
`;
		expect(codes(declaration, '/app/books.data.ts')).toEqual([]);
		const source = `import { books, setRead, unread } from './books.data.ts';
session.store.write!(setRead as Contract, {});
session?.store.write?.(setRead, {});
([books, unread] as const).map((list) => handle(list, run));
for (const list of <const>[books, unread]) session.store.read(list);
`;
		const { diagnostics, uses } = analyzeDataContracts(source, '/app/page.ts');
		expect(diagnostics).toEqual([]);
		expect(uses.map((use) => `${use.binding}@${use.site}`)).toEqual([
			'setRead@write',
			'setRead@write',
			'books@handle',
			'unread@handle',
			'books@read',
			'unread@read',
		]);
	});

	it('walks functions in a site position instead of rejecting them', () => {
		const source = `import { setRead, stats } from './books.data.ts';
export const api = {
	read() {
		return store.read(stats);
	},
	put: () => store.write(setRead, {}),
	remove: () => remember(setRead),
};
`;
		const { diagnostics, uses } = analyzeDataContracts(source, '/app/page.ts');
		expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			'OCTANE_DATA_CONTRACT_ESCAPE',
		]);
		expect(uses.map((use) => `${use.binding}@${use.site}`)).toEqual([
			'stats@read',
			'setRead@write',
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

describe('data contract program', () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
	});
	function project(files: Record<string, string>) {
		const root = realpathSync(mkdtempSync(join(tmpdir(), 'octane-data-program-')));
		roots.push(root);
		for (const [name, source] of Object.entries(files)) writeFileSync(join(root, name), source);
		return root;
	}
	const report = (root: string, files?: string[]) =>
		createDataProgram(root, files)
			.report()
			.map((diagnostic) => formatDataDiagnostic(diagnostic, root).split('] ')[0] + ']');

	it('counts only contract exports of a contract module as contracts', () => {
		const root = project({
			'books.data.ts': `${contracts}export const bookShape = z.object({ id: z.string() });\n`,
		});
		const page = `import * as books from './books.data.ts';
import { bookShape, stats } from './books.data.ts';
export const list = z.array(bookShape);
export const parsed = parse(books.bookShape, input);
export const read = () => store.read(stats);
export const escaped = remember(books.stats);
`;
		expect(
			createDataProgram(root)
				.check(join(root, 'page.ts'), page)
				.map((diagnostic: Diagnostic) => `${diagnostic.code}:${diagnostic.start.line}`),
		).toEqual(['OCTANE_DATA_CONTRACT_ESCAPE:6']);
		// Without the program, every import from the module counts.
		expect(codes(page, join(root, 'page.ts'))).toEqual([
			'OCTANE_DATA_CONTRACT_ESCAPE:3',
			'OCTANE_DATA_CONTRACT_ESCAPE:4',
			'OCTANE_DATA_CONTRACT_ESCAPE:6',
		]);
	});

	it('reports unhandled, twice-handled, unused, and duplicate contracts', () => {
		const root = project({
			'books.data.ts': contracts,
			'more.data.ts': `import { read } from 'octane/data';
export const total = read({ name: 'books.stats' });
`,
			'server.ts': `import * as Books from './books.data.ts';
import { addBook } from './books.data.ts';
createDataHandler({}, (handle, defineHandler) => [
	...defineHandler(Books, {}),
	handle(addBook, run),
]);
`,
			'page.ts': `import { setRead, stats } from './books.data.ts';
import { total } from './more.data.ts';
store.write(setRead, {});
store.read(stats);
store.read(total);
`,
			'ignored.ts': `store.read(nothing);
`,
		});
		expect(report(root)).toEqual([
			'books.data.ts:5:14 [OCTANE_DATA_CONTRACT_UNHANDLED]',
			'more.data.ts:2:14 [OCTANE_DATA_CONTRACT_DECLARATION]',
			'more.data.ts:2:14 [OCTANE_DATA_CONTRACT_UNHANDLED]',
		]);
		// An explicit file list replaces the scan: without the server, every used contract is unhandled.
		expect(
			report(
				root,
				['books.data.ts', 'page.ts'].map((file) => join(root, file)),
			),
		).toEqual([
			'books.data.ts:4:14 [OCTANE_DATA_CONTRACT_UNHANDLED]',
			'books.data.ts:5:14 [OCTANE_DATA_CONTRACT_UNUSED]',
			'books.data.ts:6:14 [OCTANE_DATA_CONTRACT_UNHANDLED]',
		]);
	});

	it('follows contract modules that import each other, and sees their edits', () => {
		const root = project({
			'a.data.ts': `import { entity } from 'octane/data';
import { Other } from './b.data.ts';
export const Thing = entity('thing', Other);
`,
			'b.data.ts': `import { entity } from 'octane/data';
import { Thing } from './a.data.ts';
export const Other = entity('other', Thing);
`,
			'page.ts': `import { stats } from './a.data.ts';\nexport const s = remember(stats);\n`,
		});
		const program = createDataProgram(root);
		expect(program.report().map((diagnostic) => diagnostic.code)).toEqual([
			'OCTANE_DATA_CONTRACT_UNUSED',
			'OCTANE_DATA_CONTRACT_UNUSED',
		]);
		// `stats` is not an export of a.data.ts, so the page holds no contract.
		expect(program.check(join(root, 'page.ts'))).toEqual([]);
		writeFileSync(
			join(root, 'a.data.ts'),
			`import { read } from 'octane/data';\nexport const stats = read({ name: 'a.stats' });\n`,
		);
		program.invalidate(join(root, 'a.data.ts'));
		expect(
			program.check(join(root, 'page.ts')).map((diagnostic: Diagnostic) => diagnostic.code),
		).toEqual(['OCTANE_DATA_CONTRACT_ESCAPE']);
	});

	it('narrows an import once its contract module appears', () => {
		const root = project({
			'page.ts': `import { bookShape } from './books.data.ts';\nexport const list = z.array(bookShape);\n`,
		});
		const program = createDataProgram(root);
		// Unknown module: every import from it counts as a contract.
		expect(program.check(join(root, 'page.ts')).map((d: Diagnostic) => d.code)).toEqual([
			'OCTANE_DATA_CONTRACT_ESCAPE',
		]);
		writeFileSync(
			join(root, 'books.data.ts'),
			`${contracts}export const bookShape = z.object({ id: z.string() });\n`,
		);
		program.invalidate(join(root, 'books.data.ts'));
		expect(program.check(join(root, 'page.ts'))).toEqual([]);
	});

	it('follows contracts a contract module re-exports', () => {
		const root = project({
			'books.data.ts': contracts,
			'index.data.ts': `export * from './more.data.ts';\nexport { setRead, stats as total } from './books.data.ts';\n`,
			'more.data.ts': `import { read } from 'octane/data';\nexport const extra = read({ name: 'more.extra' });\n`,
			'server.ts': `import * as All from './index.data.ts';
createDataHandler({}, (handle, defineHandler) => defineHandler(All, {}));
`,
			'page.ts': `import { extra, setRead, total } from './index.data.ts';
store.write(setRead, {});
store.read(total);
store.read(extra);
`,
		});
		// `defineHandler(All)` serves the re-exported contracts, under an alias and
		// through `export *`, and the page's uses through the barrel count. Only
		// `addBook`, which the barrel leaves out and nothing calls, is reported.
		expect(report(root)).toEqual(['books.data.ts:5:14 [OCTANE_DATA_CONTRACT_UNUSED]']);
	});

	it('recovers once a module with a syntax error is fixed', () => {
		const root = project({ 'books.data.ts': `${contracts}export const broken = (;\n` });
		const program = createDataProgram(root);
		const page = `import { stats } from './books.data.ts';\nexport const s = remember(stats);\n`;
		expect(program.check(join(root, 'books.data.ts'))).toEqual([]);
		expect(program.report()).toEqual([]);
		// The manifest still watches it, so fixing it regenerates the manifest.
		expect(program.manifest().files).toEqual([join(root, 'books.data.ts')]);
		writeFileSync(join(root, 'books.data.ts'), contracts);
		program.invalidate(join(root, 'books.data.ts'));
		expect(program.check(join(root, 'page.ts'), page).map((d: Diagnostic) => d.code)).toEqual([
			'OCTANE_DATA_CONTRACT_ESCAPE',
		]);
		// The fixed module's contracts are back: nothing uses them.
		expect(program.report().map((d: Diagnostic) => d.code)).toContain(
			'OCTANE_DATA_CONTRACT_UNUSED',
		);
	});

	it('opts in when the application imports the manifest', () => {
		const root = project({ 'books.data.ts': contracts });
		const program = createDataProgram(root);
		expect(program.importsManifest()).toBe(false);
		writeFileSync(join(root, 'entry.ts'), `import { contracts } from 'octane/data/manifest';\n`);
		program.invalidate(join(root, 'entry.ts'));
		expect(program.importsManifest()).toBe(true);
	});
});
