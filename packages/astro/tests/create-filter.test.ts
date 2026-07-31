import { describe, it, expect } from 'vitest';
import { createFilter } from '../src/create-filter.js';

describe('createFilter', () => {
	it('returns null when neither include nor exclude is set', () => {
		expect(createFilter(undefined, undefined)).toBeNull();
	});

	it('matches include string fragments', () => {
		const filter = createFilter(['/components/octane/'], undefined);
		expect(filter('/src/components/octane/Counter.tsrx')).toBe(true);
		expect(filter('/src/components/react/Button.tsx')).toBe(false);
	});

	it('rejects exclude patterns first', () => {
		const filter = createFilter(undefined, [/\.astro$/]);
		expect(filter('/src/pages/index.astro')).toBe(false);
		expect(filter('/src/components/Counter.tsrx')).toBe(true);
	});

	it('supports RegExp include', () => {
		const filter = createFilter(/Counter\.tsrx$/, undefined);
		expect(filter('/a/Counter.tsrx')).toBe(true);
		expect(filter('/a/Other.tsrx')).toBe(false);
	});
});
