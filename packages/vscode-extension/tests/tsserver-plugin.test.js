import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const {
	OCTANE_TSRX_LANGUAGE_ID,
	createOctaneLanguagePlugin,
	loadCompiler,
} = require('../src/tsserver-plugin.cjs');
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY_ROOT = path.resolve(PACKAGE_ROOT, '../..');

describe('Octane TSRX TypeScript plugin', () => {
	it('compiles TSRX through the Octane Volar adapter', () => {
		const plugin = createOctaneLanguagePlugin(ts);
		const fileName = path.join(REPOSITORY_ROOT, 'playground/App.tsrx');
		const source = `export function App() @{ <main>Hello</main> }`;
		const virtualCode = plugin.createVirtualCode(
			fileName,
			OCTANE_TSRX_LANGUAGE_ID,
			ts.ScriptSnapshot.fromString(source),
		);

		expect(plugin.getLanguageId(fileName)).toBe(OCTANE_TSRX_LANGUAGE_ID);
		expect(virtualCode.snapshot.getText(0, virtualCode.snapshot.getLength())).toContain(
			'@jsxImportSource octane',
		);
		expect(virtualCode.mappings.length).toBeGreaterThan(0);
	});

	it('falls back to the compiler bundled with the extension', () => {
		const compile = loadCompiler(ts, '/tmp/octane-vscode-loose-file/App.tsrx');
		const result = compile(`export function App() @{ <main /> }`, 'App.tsrx', {
			loose: true,
		});

		expect(result.code).toContain('@jsxImportSource octane');
	});

	it('preserves member completions while a dot makes the source temporarily invalid', () => {
		const plugin = createOctaneLanguagePlugin(ts);
		const source = `export function App() @{\n const value = 'x';\n value.\n <main>{value}</main>\n}`;
		const virtualCode = plugin.createVirtualCode(
			'/tmp/octane-vscode-loose-file/App.tsrx',
			OCTANE_TSRX_LANGUAGE_ID,
			ts.ScriptSnapshot.fromString(source),
		);
		const generated = virtualCode.snapshot.getText(0, virtualCode.snapshot.getLength());

		expect(generated).toContain('value.');
		expect(virtualCode.mappings.length).toBeGreaterThan(1);
	});

	it('honors an explicit tsrx.compiler override', () => {
		const fixture = path.join(PACKAGE_ROOT, 'tests/_fixtures/compiler-override');
		const compile = loadCompiler(ts, path.join(fixture, 'App.tsrx'));
		const result = compile('source');

		expect(result.code).toBe('/* configured compiler */\nsource');
	});
});
