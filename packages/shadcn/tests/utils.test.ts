import { describe, expect, it } from 'vitest';
import { cn } from '@octanejs/shadcn';

describe('@octanejs/shadcn — cn()', () => {
	it('composes clsx-style inputs (strings, arrays, objects, falsy dropout)', () => {
		expect(cn('a', ['b', { c: true, d: false }], undefined, null, 0, 'e')).toBe('a b c e');
	});

	it('resolves Tailwind utility conflicts via tailwind-merge (last wins)', () => {
		expect(cn('p-2', 'p-4')).toBe('p-4');
		expect(cn('overflow-hidden', 'overflow-visible')).toBe('overflow-visible');
		expect(cn('text-sm', 'font-medium', 'text-lg')).toBe('font-medium text-lg');
	});

	it('keeps non-conflicting and unknown classes intact', () => {
		expect(cn('cn-badge', 'custom-extra')).toBe('cn-badge custom-extra');
	});
});
