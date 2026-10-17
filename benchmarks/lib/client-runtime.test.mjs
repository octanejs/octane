import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
import ts from 'typescript';
import { readClientRuntime } from './client-runtime.mjs';

const source = path.resolve(import.meta.dirname, '../../packages/octane/src');
const runtime = path.join(source, 'runtime.ts');
const parse = (text) =>
	ts.createSourceFile('runtime.ts', text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
const exported = (sf) =>
	sf.statements.flatMap((st) => {
		if (ts.isExportDeclaration(st)) return st.exportClause.elements.map((el) => el.name.text);
		if (!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return [];
		if (ts.isVariableStatement(st))
			return st.declarationList.declarations.map((d) => d.name.getText());
		return st.name ? [st.name.text] : [];
	});
const declared = (sf) =>
	sf.statements.flatMap((st) =>
		ts.isVariableStatement(st)
			? st.declarationList.declarations.map((d) => d.name.getText())
			: !ts.isImportDeclaration(st) && !ts.isExportDeclaration(st) && st.name
				? [st.name.text]
				: [],
	);

test('the joined client runtime has every runtime declaration once and runtime.ts exports', () => {
	const joined = parse(readClientRuntime());
	assert.equal(joined.parseDiagnostics.length, 0);
	// A merged declaration (a function and its namespace or type) exports one name.
	const surface = (sf) => [...new Set(exported(sf))].sort();
	assert.deepEqual(surface(joined), surface(parse(fs.readFileSync(runtime, 'utf8'))));
	const dir = path.join(source, 'runtime');
	const modules = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.ts')) : [];
	const names = modules.flatMap((f) => declared(parse(fs.readFileSync(path.join(dir, f), 'utf8'))));
	const ambient = new Set(['process', '__OCTANE_PROFILE_ENABLED__']);
	const own = declared(joined).filter((name) => !ambient.has(name));
	assert.deepEqual(
		own.sort(),
		(modules.length ? names : own).filter((name) => !ambient.has(name)).sort(),
	);
});

test('a harness can bundle the joined runtime in place of runtime.ts', async () => {
	const text = readClientRuntime();
	const result = await build({
		stdin: {
			contents: `export { createRoot, flushSync } from ${JSON.stringify(runtime)};`,
			resolveDir: source,
		},
		bundle: true,
		write: false,
		format: 'esm',
		logLevel: 'silent',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		plugins: [
			{
				name: 'joined-runtime',
				setup(plugin) {
					plugin.onLoad({ filter: /\/runtime\.ts$/ }, () => ({ contents: text, loader: 'ts' }));
				},
			},
		],
		metafile: true,
	});
	const inputs = Object.keys(result.metafile.inputs);
	assert.ok(inputs.some((file) => path.resolve(file) === runtime));
	assert.ok(!inputs.some((file) => file.includes('/src/runtime/')));
});
