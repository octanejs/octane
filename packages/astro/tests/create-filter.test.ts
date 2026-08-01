import { describe, it, expect } from 'vitest';
import { compileFilterPatterns } from '../src/compile-filter-patterns.js';
import { createFilter } from '../src/create-filter.js';

describe('createFilter', () => {
	it('returns null when neither include nor exclude is set', () => {
		expect(createFilter(undefined, undefined)).toBeNull();
	});

	it('matches README-style include globs after compile', () => {
		const include = compileFilterPatterns(['**/components/octane/**']);
		const filter = createFilter(include, null);
		expect(filter('/src/components/octane/Counter.tsrx')).toBe(true);
		expect(filter('/src/components/react/Button.tsx')).toBe(false);
	});

	it('normalizes backslashes in module ids', () => {
		const include = compileFilterPatterns(['**/components/octane/**']);
		const filter = createFilter(include, null);
		expect(filter('src\\components\\octane\\Counter.tsrx')).toBe(true);
	});

	it('rejects exclude patterns first', () => {
		const filter = createFilter(null, [/\.astro$/]);
		expect(filter('/src/pages/index.astro')).toBe(false);
		expect(filter('/src/components/Counter.tsrx')).toBe(true);
	});

	it('supports RegExp include', () => {
		const filter = createFilter(/Counter\.tsrx$/, null);
		expect(filter('/a/Counter.tsrx')).toBe(true);
		expect(filter('/a/Other.tsrx')).toBe(false);
	});

	it('rejects null-byte ids', () => {
		const filter = createFilter(compileFilterPatterns(['**/*.tsrx']), null);
		expect(filter('file\0.tsrx')).toBe(false);
	});

	it('strips Vite query suffixes before matching', () => {
		const include = compileFilterPatterns(['**/components/octane/**']);
		const filter = createFilter(include, null);
		expect(filter('/src/components/octane/Counter.tsrx?t=123')).toBe(true);
		expect(filter('/src/components/react/Button.tsx?v=abc')).toBe(false);

		const exclude = createFilter(null, compileFilterPatterns(['**/components/react/**']));
		expect(exclude('/src/components/react/Button.tsrx?t=1')).toBe(false);
		expect(exclude('/src/components/octane/Counter.tsrx?t=1')).toBe(true);

		const anchored = createFilter(/Counter\.tsrx$/, null);
		expect(anchored('/a/Counter.tsrx?t=hmr')).toBe(true);
	});
});

describe('compileFilterPatterns', () => {
	it('returns null for nullish or empty input', () => {
		expect(compileFilterPatterns(undefined)).toBeNull();
		expect(compileFilterPatterns(null)).toBeNull();
		expect(compileFilterPatterns([])).toBeNull();
	});

	it('passes RegExp through and compiles string globs', () => {
		const compiled = compileFilterPatterns([/\.tsrx$/, '**/octane/**']);
		expect(compiled).toHaveLength(2);
		expect(compiled[0]).toBeInstanceOf(RegExp);
		expect(compiled[1]).toBeInstanceOf(RegExp);
		expect(compiled[0].test('/a/Counter.tsrx')).toBe(true);
		expect(compiled[1].test('/src/components/octane/x.tsrx')).toBe(true);
	});
});
