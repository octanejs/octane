// @vitest-environment node

/**
 * A contract declared with the function that serves it: the client build
 * keeps the contract and drops the function, with the server-only modules it
 * used, while the server build keeps both.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { octane } from '../../src/compiler/vite.js';
import { createTempProject, type TempProject } from '../_temp-project.js';

const projects: TempProject[] = [];
afterEach(() => {
	for (const project of projects.splice(0)) project.dispose();
});

function fixture(): string {
	const project = createTempProject('octane-data-served-vite', { insideWorkspace: true });
	projects.push(project);
	const files: Record<string, string> = {
		'package.json': JSON.stringify({ type: 'module' }),
		'db.server.ts':
			"import { DatabaseSync } from 'node:sqlite';\nexport const db = new DatabaseSync(':memory:');\nexport const SECRET = 'server-only-secret';\n",
		'books.data.ts': `import { entity, read, type StandardSchema } from 'octane/data';
import type { DataCall } from 'octane/data/server';
import { db, SECRET } from './db.server.ts';

const any = <T>(): StandardSchema<unknown, T> => ({
	'~standard': { version: 1, vendor: 'test', validate: (value) => ({ value: value as T }) },
});
export const Book = entity('book', any<{ id: string; title: string }>());
const statement = db.prepare('SELECT id, title FROM book WHERE id = ?');
export const book = read(
	{ name: 'books.one', input: any<string>(), output: Book.one },
	(id, call: DataCall) => (call.signal.aborted ? null : statement.get(id, SECRET)) as never,
);
`,
		'page.ts': "import { book } from './books.data.ts';\nglobalThis.page = book.name;\n",
	};
	for (const [file, source] of Object.entries(files))
		writeFileSync(join(project.root, file), source);
	return project.root;
}

function output(dir: string): string {
	return readdirSync(dir, { recursive: true, encoding: 'utf8' })
		.filter((file) => file.endsWith('.js'))
		.map((file) => readFileSync(join(dir, file), 'utf8'))
		.join('\n');
}

describe('a contract declared with its function, built by Vite', () => {
	it('keeps the function and its server modules out of the client build only', async () => {
		const root = fixture();
		const options = (ssr: boolean) => ({
			root,
			configFile: false as const,
			logLevel: 'silent' as const,
			plugins: [octane({ hmr: false })],
			build: {
				outDir: ssr ? 'server' : 'client',
				minify: false,
				ssr: ssr ? join(root, 'page.ts') : false,
				rolldownOptions: ssr ? {} : { input: join(root, 'page.ts') },
			},
		});
		await build(options(false));
		await build(options(true));

		const client = output(join(root, 'client'));
		expect(client).toContain('books.one');
		expect(client).not.toContain('server-only-secret');
		expect(client).not.toContain('node:sqlite');
		expect(client).not.toContain('SELECT id');

		const server = output(join(root, 'server'));
		expect(server).toContain('server-only-secret');
		expect(server).toContain('SELECT id');
	});
});
