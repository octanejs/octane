import { describe, it, expect } from 'vitest';
import { nextIdentifierPrefix, getContext } from '../src/context.js';

describe('context identifier prefixes', () => {
	it('increments a unique prefix per island for the same SSR result', () => {
		const result = {};
		expect(nextIdentifierPrefix(result)).toBe('o0');
		expect(nextIdentifierPrefix(result)).toBe('o1');
		expect(nextIdentifierPrefix(result)).toBe('o2');
		expect(getContext(result).id).toBe(3);
	});

	it('isolates counters across SSR result objects', () => {
		const a = {};
		const b = {};
		expect(nextIdentifierPrefix(a)).toBe('o0');
		expect(nextIdentifierPrefix(b)).toBe('o0');
		expect(nextIdentifierPrefix(a)).toBe('o1');
	});
});
