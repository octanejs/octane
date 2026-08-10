import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('subSlot', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('preserves derived identities across module re-evaluation', async () => {
		const parent = Symbol.for('solana-react:test-parent');
		const first = await import('../src/internal');
		const firstChild = first.subSlot(parent, 'client');

		vi.resetModules();
		const second = await import('../src/internal');

		expect(second.subSlot(parent, 'client')).toBe(firstChild);
		expect(Symbol.keyFor(firstChild)).toBe('solana-react:test-parent:client');
	});

	it('keeps distinct tags in distinct hook cells', async () => {
		const { subSlot } = await import('../src/internal');
		const parent = Symbol.for('solana-react:distinct-tags');

		expect(subSlot(parent, 'client')).not.toBe(subSlot(parent, 'capability'));
	});
});
