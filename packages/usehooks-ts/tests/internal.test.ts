import { describe, expect, it } from 'vitest';
import { subSlot } from '../src/internal';

describe('composed hook identity', () => {
	it('keeps child identities stable, namespaced, and independent by call site', () => {
		const first = Symbol.for('fixture:first');
		const second = Symbol.for('fixture:second');
		const firstChild = subSlot(first, 'state');

		expect(subSlot(first, 'state')).toBe(firstChild);
		expect(subSlot(second, 'state')).not.toBe(firstChild);
		expect(Symbol.keyFor(firstChild!)).toBe('@octanejs/usehooks-ts:fixture:first:state');
		expect(Symbol.for('@octanejs/usehooks-ts:fixture:first:state')).toBe(firstChild);
	});
});
