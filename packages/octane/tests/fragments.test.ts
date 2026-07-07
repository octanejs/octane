import { describe, it, expect, vi } from 'vitest';
import { mount } from './_helpers';
import { MultiTop, Mixed, Nested, ValueFragment } from './_fixtures/fragments.tsrx';

describe('fragments', () => {
	it('mounts multi-root top-level fragment', () => {
		const r = mount(MultiTop);
		expect(r.findAll('p').map((p) => p.textContent)).toEqual(['1', '2', '3']);
		r.unmount();
		expect(r.container.parentNode).toBe(null);
	});

	it('flattens fragment children inside an element', () => {
		const r = mount(Mixed);
		expect(r.find('div .a').textContent).toBe('A');
		expect(r.find('div .b').textContent).toBe('B');
		expect(r.findAll('div > span')).toHaveLength(2);
		r.unmount();
	});

	it('flattens nested fragments', () => {
		const r = mount(Nested);
		expect(r.findAll('p').map((p) => p.textContent)).toEqual(['x', 'y', 'z']);
		r.unmount();
	});

	// A `return <>…</>` fragment is STATIC children (React's jsxs) — its lowered
	// descriptor array is positional-tagged by the compiler, so the de-opt list
	// keys it by index WITHOUT the missing-key warning (which stays reserved for
	// runtime-built arrays like unkeyed `.map()` results — see
	// conformance/deopt-list.test.ts).
	it('mounts a value-position fragment without the missing-key warning', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const r = mount(ValueFragment);
			expect(r.findAll('p').map((p) => p.textContent)).toEqual(['1', '2']);
			r.unmount();
			const keyWarnings = warn.mock.calls.filter((args) => /key/i.test(String(args[0])));
			expect(keyWarnings).toEqual([]);
		} finally {
			warn.mockRestore();
		}
	});
});
