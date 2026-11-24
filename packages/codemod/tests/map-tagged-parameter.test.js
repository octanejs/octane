import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { runCodemod } from '../dist/index.js';

it.each([false, true])(
	'refuses to migrate a tagged template that reads a later map index (project types %s)',
	async (projectTypes) => {
		/** @param {string} expression */
		const list = (expression) => `function fail(): never { throw Error('prior evaluation'); }
function tag(_: TemplateStringsArray, value: number) { return value; }
const tags = { tag };
export function List({ show }: { show: boolean }) {
	return <ul>{show && [{ id: 1 }, { id: 2 }].map(({ id, label = ${expression} }, index) => <li key={id}>{label}</li>)}</ul>;
}`;
		const source = list('((_: TemplateStringsArray, value: number) => value)`${index}`');
		const laterSubstitution = list(
			'((_: TemplateStringsArray, prefix: object, value: number) => value)`${{ prefix: 1 }}${index}`',
		);
		const tagRead = list('(index as unknown as () => number)`unused`');
		const earlierThrow = list(
			'((_: TemplateStringsArray, prefix: never, value: number) => value)`${fail()}${index}`',
		);
		const throwingTag = list('(fail() as () => number)`${index}`');
		const identifierTag = list('tag`${index}`');
		// An uninitialized later binding throws first, and a member getter may.
		const laterTag = list('tag`${index}`').replace(' }, index)', ', later: tag }, index)');
		const memberTag = list('tags.tag`${index}`');
		const literal = list('((_: TemplateStringsArray, value: number) => value)`${7}`');
		const sources = {
			'package.json': '{"name":"codemod-test","type":"module","private":true}',
			'tsconfig.json':
				'{"compilerOptions":{"strict":true,"jsx":"react-jsx","moduleResolution":"bundler"}}',
			'index.html': '<script type="module" src="./Caller.tsx"></script>',
			'Caller.tsx': "import { List } from './List.tsx'; export const Caller = () => <List show />;",
			'List.tsx': source,
			'LaterSubstitution.tsx': laterSubstitution,
			'TagRead.tsx': tagRead,
			'EarlierThrow.tsx': earlierThrow,
			'ThrowingTag.tsx': throwingTag,
			'IdentifierTag.tsx': identifierTag,
			'LaterTag.tsx': laterTag,
			'MemberTag.tsx': memberTag,
			'Literal.tsx': literal,
		};
		const root = mkdtempSync(join(tmpdir(), 'octane-codemod-tagged-'));
		try {
			for (const [file, content] of Object.entries(sources)) {
				writeFileSync(join(root, file), content);
			}
			symlinkSync(join(import.meta.dirname, '../node_modules'), join(root, 'node_modules'), 'dir');
			const inputs = Object.keys(sources)
				.filter((file) => file.endsWith('.tsx'))
				.map((file) => join(root, file));
			const options = { root, strong: true, projectTypes };
			const blocked = expect.objectContaining({ rule: 'map-parameter-tdz', severity: 'error' });
			const preview = await runCodemod(inputs, { ...options, write: false });
			const files = new Map(preview.files.map((file) => [file.file, file]));
			for (const file of [
				'List.tsx',
				'LaterSubstitution.tsx',
				'TagRead.tsx',
				'IdentifierTag.tsx',
			]) {
				expect(files.get(file), file).toMatchObject({
					code: expect.stringContaining('@for'),
					notes: [blocked],
				});
			}
			for (const file of [
				'EarlierThrow.tsx',
				'ThrowingTag.tsx',
				'LaterTag.tsx',
				'MemberTag.tsx',
				'Literal.tsx',
			]) {
				expect(files.get(file)?.notes, file).not.toContainEqual(blocked);
				expect(files.get(file)?.code, file).toContain('@for');
			}

			const write = await runCodemod(inputs, options);
			expect(write.files).toEqual([
				expect.objectContaining({
					file: 'List.tsx',
					output: 'List.tsx',
					changed: false,
					notes: [blocked],
				}),
			]);
			expect(readdirSync(root).sort()).toEqual([...Object.keys(sources), 'node_modules'].sort());
			for (const [file, content] of Object.entries(sources)) {
				expect(readFileSync(join(root, file), 'utf8'), file).toBe(content);
			}
		} finally {
			rmSync(root, { force: true, recursive: true });
		}
	},
);
