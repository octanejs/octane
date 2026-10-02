import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as tsrxPlugin from '@tsrx/prettier-plugin';
import * as prettier from 'prettier';

// The repository formats `.tsrx` with @tsrx/prettier-plugin. Its 0.4 printer
// re-emitted every node from scratch, so a statement it could not print became
// a placeholder comment, and an empty loop body vanished so the next statement
// became the body. Both rewrites pass `prettier --check` once committed, so
// these tests pin the output and compare the AST before and after formatting.

const FIXTURE = fileURLToPath(new URL('./fixtures/tsrx-prettier-statements.tsrx', import.meta.url));
const IGNORE_FILE = fileURLToPath(new URL('../.prettierignore', import.meta.url));
// Plugin names resolve from the working directory, so pass the module itself.
const { plugins: configuredPlugins, ...config } = await prettier.resolveConfig(FIXTURE);

/** @param {string} source */
async function format(source) {
	const options = { ...config, plugins: [tsrxPlugin], filepath: FIXTURE };
	const once = await prettier.format(source, options);
	const twice = await prettier.format(once, options);
	assert.equal(twice, once, 'formatting must be idempotent');
	return once;
}

const POSITION_KEYS = new Set([
	'start',
	'end',
	'loc',
	'range',
	'metadata',
	'leadingComments',
	'trailingComments',
	'innerComments',
	'comments',
]);

/** @param {unknown} node */
function withoutPositions(node) {
	if (Array.isArray(node)) return node.map(withoutPositions);
	if (!node || typeof node !== 'object') return node;
	return Object.fromEntries(
		Object.entries(node)
			.filter(([key]) => !POSITION_KEYS.has(key))
			.map(([key, value]) => [key, withoutPositions(value)]),
	);
}

/** @param {string} source */
async function parse(source) {
	return tsrxPlugin.parsers.tsrx.parse(source, { filepath: FIXTURE });
}

/**
 * @param {unknown} node
 * @param {string} type
 * @returns {number}
 */
function countNodes(node, type) {
	if (Array.isArray(node)) return node.reduce((sum, child) => sum + countNodes(child, type), 0);
	if (!node || typeof node !== 'object') return 0;
	let count = /** @type {{ type?: unknown }} */ (node).type === type ? 1 : 0;
	for (const [key, value] of Object.entries(node)) {
		if (!POSITION_KEYS.has(key)) count += countNodes(value, type);
	}
	return count;
}

/**
 * @param {string} input
 * @param {string} expected
 */
async function assertFormats(input, expected) {
	const output = await format(input);
	assert.equal(output, `${expected}\n`);
	assert.deepEqual(withoutPositions(await parse(output)), withoutPositions(await parse(input)));
}

describe('@tsrx/prettier-plugin statements', () => {
	test('keeps the committed fixture byte-identical under the repository config', async () => {
		const info = await prettier.getFileInfo(FIXTURE, { ignorePath: IGNORE_FILE });
		assert.deepEqual(info, { ignored: false, inferredParser: 'tsrx' });
		assert.ok(configuredPlugins.includes('@tsrx/prettier-plugin'));

		const source = readFileSync(FIXTURE, 'utf8');
		assert.equal(await format(source), source);
		const ast = await parse(source);
		assert.equal(countNodes(ast, 'LabeledStatement'), 6);
		assert.equal(countNodes(ast, 'EmptyStatement'), 4);
	});

	test('keeps a labeled block in an @for body', async () => {
		const source = `export function Rows({ rows }: { rows: string[] }) @{
	<ul>
		@for (const row of rows; key row) {
			label: {
				if (row !== 'label') break label;
			}
			<li>{row}</li>
		}
	</ul>
}`;
		await assertFormats(source, source);
	});

	test('keeps labeled loops, blocks, stacked labels, and empty labeled statements', async () => {
		for (const source of [
			'outer: for (const row of rows) {\n\tfor (const cell of row) {\n\t\tif (cell) continue outer;\n\t}\n}',
			'block: {\n\tbreak block;\n}',
			'a: b: while (true) break a;',
			'loop: do {\n\tcontinue loop;\n} while (next());',
			'attempt: try {\n\tbreak attempt;\n} finally {\n\tdone();\n}',
			'switch (x) {\n\tcase 1:\n\t\tinner: for (;;) break inner;\n}',
			'label:;',
		]) {
			await assertFormats(source, source);
		}
		await assertFormats(
			'outer:for(const x of xs){continue outer}',
			'outer: for (const x of xs) {\n\tcontinue outer;\n}',
		);
		await assertFormats('empty: {}', 'empty: {\n}');
	});

	test('places comments around a label like Prettier', async () => {
		await assertFormats(
			'a: // loop\nfor (;;) {\n\tbreak a;\n}',
			'// loop\na: for (;;) {\n\tbreak a;\n}',
		);
		await assertFormats('b: /* after */ run();', 'b: /* after */ run();');
		await assertFormats(
			'c /* before */: for (;;) {\n\tbreak c;\n}',
			'c /* before */: for (;;) {\n\tbreak c;\n}',
		);
		await assertFormats(
			'd: // prettier-ignore\nfor (  ;; ) {  break d }',
			'd: // prettier-ignore\nfor (  ;; ) {  break d }',
		);
	});

	test('keeps an empty statement body instead of adopting the next statement', async () => {
		for (const source of [
			'while (next());\ncount++;',
			'for (let i = 0; i < n; i++);\ncount++;',
			'for (const x of xs);\ncount++;',
			'for (const k in o);\ncount++;',
			'if (a);\nelse b();',
			'if (a) b();\nelse;\ncount++;',
		]) {
			await assertFormats(source, source);
		}
		// Prettier's own layout for an empty `do` body.
		await assertFormats('do; while (a--);', 'do;\nwhile (a--);');
	});

	test('throws on a node type it cannot print instead of writing a placeholder', async () => {
		const tsrx = tsrxPlugin.parsers.tsrx;
		const futureParser = {
			...tsrx,
			/** @param {string} text @param {import('prettier').ParserOptions} options */
			async parse(text, options) {
				const ast = await tsrx.parse(text, options);
				return { ...ast, body: [{ ...ast.body[0], type: 'FutureStatement' }] };
			},
		};
		await assert.rejects(
			prettier.format('run();\n', {
				parser: 'tsrx-future',
				plugins: [tsrxPlugin, { parsers: { 'tsrx-future': futureParser } }],
			}),
			/FutureStatement/,
		);
	});
});
