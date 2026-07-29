// Unit tests for the vendored cmdk scorer and the package's defaultFilter.
// These are framework-free (no octane/react): they pin the exact score
// constants and the relative ordering cmdk relies on for result ranking, so a
// regression in the vendored copy is caught immediately.
import { describe, expect, it } from 'vitest';
import { commandScore } from '../src/command-score.ts';
import { defaultFilter } from '../src/filter.ts';

describe('commandScore', () => {
	it('scores a full, exact match as 1', () => {
		expect(commandScore('hello', 'hello', [])).toBe(1);
	});

	it('scores an incomplete prefix match as PENALTY_NOT_COMPLETE (0.99)', () => {
		expect(commandScore('hello', 'hel', [])).toBe(0.99);
	});

	it('scores a non-match as 0', () => {
		expect(commandScore('hello', 'xyz', [])).toBe(0);
	});

	it('is case-insensitive but still matches', () => {
		expect(commandScore('Hello World', 'hw', [])).toBeGreaterThan(0);
	});

	it('ranks a word-start match above a mid-word match', () => {
		// "Rea" starts React but is mid-word in Preact → React ranks higher.
		expect(commandScore('React', 'Rea', [])).toBeGreaterThan(commandScore('Preact', 'Rea', []));
	});

	it('folds aliases into the scored string so keyword matches count', () => {
		expect(commandScore('Settings', 'prefs', [])).toBe(0);
		expect(commandScore('Settings', 'prefs', ['preferences'])).toBeGreaterThan(0);
	});
});

describe('defaultFilter', () => {
	it('delegates to commandScore for the no-keywords case', () => {
		expect(defaultFilter('hello', 'hello')).toBe(commandScore('hello', 'hello', []));
		expect(defaultFilter('hello', 'xyz')).toBe(0);
	});

	it('passes keywords through as aliases', () => {
		expect(defaultFilter('Settings', 'prefs', ['preferences'])).toBeGreaterThan(0);
	});
});
