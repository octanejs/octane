import { describe, expect, it, vi } from 'vitest';
import { subSlot } from '../src/internal';

describe('subSlot', () => {
	it('preserves derived identities across module re-evaluation', async () => {
		const parent = Symbol.for('solana-kit:test-parent');
		const firstChild = subSlot(parent, 'client');

		vi.resetModules();
		const second = await import('../src/internal');

		expect(second.subSlot(parent, 'client')).toBe(firstChild);
		expect(Symbol.keyFor(firstChild)).toBe('solana-kit:test-parent:client');
	});

	it('keeps distinct tags in distinct hook cells', () => {
		const parent = Symbol.for('solana-kit:distinct-tags');

		expect(subSlot(parent, 'client')).not.toBe(subSlot(parent, 'capability'));
	});
});
