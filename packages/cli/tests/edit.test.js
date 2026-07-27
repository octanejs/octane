import { describe, expect, it } from 'vitest';
import { findNestedProperty, setCompilerOption } from '../src/kernel/edit.js';
import { parseJsonc } from '../src/kernel/jsonc.js';

describe('setCompilerOption', () => {
	it('inserts a key while preserving comments and trailing commas', () => {
		const source = `{
	// keep me
	"compilerOptions": {
		"strict": true,
	},
	"include": ["src"]
}`;
		const edited = setCompilerOption(source, 'jsxImportSource', 'octane');
		expect(edited?.changed).toBe(true);
		expect(edited?.text).toContain('// keep me');
		expect(edited?.text).toContain('"strict": true,');
		// The result must still be a readable tsconfig, comments and trailing
		// comma included, not merely a string containing the right substring.
		expect(parseJsonc(edited.text)).toEqual({
			compilerOptions: { jsxImportSource: 'octane', strict: true },
			include: ['src'],
		});
	});

	it('treats comments as prose, not syntax', () => {
		// A `}` or a quoted key inside a JSONC comment previously closed the wrong
		// object, so the edit landed past it and duplicated `compilerOptions`
		// while leaving the real one untouched.
		const source =
			'{\n\t// "jsxImportSource": "react" was wrong here }\n' +
			'\t"compilerOptions": {\n\t\t"strict": true\n\t}\n}';

		const edited = setCompilerOption(source, 'jsxImportSource', 'octane');
		const parsed = parseJsonc(edited.text);

		expect(edited.text).toContain('// "jsxImportSource": "react" was wrong here }');
		expect(Object.keys(parsed)).toEqual(['compilerOptions']);
		expect(parsed.compilerOptions).toEqual({ jsxImportSource: 'octane', strict: true });
	});

	it('sees past a block comment and a comment before the root brace', () => {
		const block = setCompilerOption(
			'{\n\t/* legacy: { "jsxImportSource": "react" } */\n\t"compilerOptions": { "strict": true }\n}',
			'jsxImportSource',
			'octane',
		);
		expect(parseJsonc(block.text).compilerOptions).toEqual({
			jsxImportSource: 'octane',
			strict: true,
		});

		const leading = setCompilerOption(
			'// tsconfig for the app {\n{\n\t"compilerOptions": { "strict": true }\n}',
			'jsxImportSource',
			'octane',
		);
		expect(parseJsonc(leading.text).compilerOptions.jsxImportSource).toBe('octane');
	});

	it('does not swallow a comment trailing the value it replaces', () => {
		const edited = setCompilerOption(
			'{\n\t"compilerOptions": {\n\t\t"jsxImportSource": "react" // legacy\n\t}\n}',
			'jsxImportSource',
			'octane',
		);

		expect(edited.text).toContain('"octane" // legacy');
		expect(parseJsonc(edited.text).compilerOptions.jsxImportSource).toBe('octane');
	});

	it('replaces an existing value in place', () => {
		const source = '{\n\t"compilerOptions": {\n\t\t"jsxImportSource": "react"\n\t}\n}';
		const edited = setCompilerOption(source, 'jsxImportSource', 'octane');
		expect(edited?.changed).toBe(true);
		expect(edited?.text).toContain('"jsxImportSource": "octane"');
		expect(edited?.text).not.toContain('react');
	});

	it('reports no change when the value already matches', () => {
		const source = '{\n\t"compilerOptions": {\n\t\t"jsxImportSource": "octane"\n\t}\n}';
		expect(setCompilerOption(source, 'jsxImportSource', 'octane')?.changed).toBe(false);
	});

	it('creates compilerOptions when the file has none', () => {
		const edited = setCompilerOption('{\n\t"include": ["src"]\n}', 'jsxImportSource', 'octane');
		expect(edited?.changed).toBe(true);
		expect(JSON.parse(edited.text)).toEqual({
			compilerOptions: { jsxImportSource: 'octane' },
			include: ['src'],
		});
	});

	it('writes non-scalar values', () => {
		const edited = setCompilerOption('{"compilerOptions":{}}', 'plugins', [
			{ name: '@tsrx/typescript-plugin' },
		]);
		expect(JSON.parse(edited.text).compilerOptions.plugins).toEqual([
			{ name: '@tsrx/typescript-plugin' },
		]);
	});
});

describe('findNestedProperty', () => {
	it('resolves a nested value range for splicing', () => {
		const source = '{\n\t"scripts": {\n\t\t"typecheck": "tsc --noEmit"\n\t}\n}';
		const range = findNestedProperty(source, ['scripts', 'typecheck']);
		expect(source.slice(range.valueStart, range.valueEnd)).toBe('"tsc --noEmit"');
	});

	it('returns null when the path is absent', () => {
		expect(findNestedProperty('{"scripts":{}}', ['scripts', 'typecheck'])).toBe(null);
	});
});
