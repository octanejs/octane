import { describe, expect, it } from 'vitest';
import { subSlot } from '../src/internal';

describe('Wagmi hook slots', () => {
	it('preserves the parent identity when deriving child slots', () => {
		const first = Symbol.for('component:first');
		const second = Symbol.for('component:second');

		expect(subSlot(first, 'query')).toBe(Symbol.for('component:first:query'));
		expect(subSlot(second, 'query')).toBe(Symbol.for('component:second:query'));
		expect(subSlot(first, 'query')).not.toBe(subSlot(second, 'query'));
	});
});
