import { describe, expect, it } from 'vitest';
import { satisfies } from '../src/kernel/semver.js';

describe('satisfies', () => {
	it('evaluates the caret range octane publishes for vite', () => {
		expect(satisfies('8.1.5', '^8.0.16')).toBe(true);
		expect(satisfies('8.0.16', '^8.0.16')).toBe(true);
		expect(satisfies('8.0.15', '^8.0.16')).toBe(false);
		expect(satisfies('9.0.0', '^8.0.16')).toBe(false);
	});

	it('applies the 0.x caret rules', () => {
		expect(satisfies('0.2.9', '^0.2.3')).toBe(true);
		expect(satisfies('0.3.0', '^0.2.3')).toBe(false);
		expect(satisfies('0.0.3', '^0.0.3')).toBe(true);
		expect(satisfies('0.0.4', '^0.0.3')).toBe(false);
	});

	it('handles comparators, unions, and wildcards', () => {
		expect(satisfies('22.1.0', '>=22')).toBe(true);
		expect(satisfies('21.9.0', '>=22')).toBe(false);
		expect(satisfies('1.5.0', '>=1.0.0 <2.0.0')).toBe(true);
		expect(satisfies('2.0.0', '>=1.0.0 <2.0.0')).toBe(false);
		expect(satisfies('19.2.0', '^18.0.0 || ^19.0.0')).toBe(true);
		expect(satisfies('1.0.0', '*')).toBe(true);
	});

	it('orders prereleases below their release', () => {
		expect(satisfies('2.0.0-beta.1', '>=2.0.0')).toBe(false);
		expect(satisfies('2.0.0', '>=2.0.0')).toBe(true);
	});

	it('returns null for ranges it cannot evaluate, rather than guessing', () => {
		// The dependency checks report "not verified" on null. Answering true or
		// false here would be an invented verdict about a workspace link.
		expect(satisfies('0.1.17', 'workspace:*')).toBe(null);
		expect(satisfies('0.1.17', 'github:octanejs/octane')).toBe(null);
		expect(satisfies('not-a-version', '^1.0.0')).toBe(null);
	});
});
