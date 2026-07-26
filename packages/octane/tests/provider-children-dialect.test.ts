import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import {
	ProviderChildrenDialectFlip,
	ProviderChildrenDialectFlipWithState,
	ProviderChildrenDialectFlipWithSiblings,
} from './_fixtures/provider-children-dialect.tsrx';

// A Provider accepts its children in either dialect: the compiled children-block function a
// `.tsrx` parent passes, or an element descriptor from a `createElement` parent. Bindings that
// wrap children conditionally flip between the two across renders, and the Provider must keep
// rendering them — and keep providing context — rather than corrupting the tree.
describe('context Provider — children dialect changes', () => {
	it('keeps rendering children when they flip from a children-block to a descriptor', () => {
		const m = mount(ProviderChildrenDialectFlip);
		expect(m.container.querySelector('.val')?.textContent).toBe('ctx');

		m.click('.toggle');
		expect(m.container.querySelector('.toggle')).not.toBe(null);
		expect(m.container.querySelector('.val')?.textContent).toBe('ctx');

		m.click('.toggle');
		expect(m.container.querySelector('.val')?.textContent).toBe('ctx');

		m.unmount();
	});

	it('remounts the children across the flip, so their state resets', () => {
		const m = mount(ProviderChildrenDialectFlipWithState);
		expect(m.container.querySelector('.count')?.textContent).toBe('n0');

		m.click('.count');
		m.click('.count');
		expect(m.container.querySelector('.count')?.textContent).toBe('n2');

		// The children are structurally different code either side of the flip, so they remount
		// and their state starts over — the same contract React gives an element-type change.
		m.click('.toggle');
		expect(m.container.querySelector('.count')?.textContent).toBe('n0');

		m.click('.count');
		expect(m.container.querySelector('.count')?.textContent).toBe('n1');

		m.unmount();
	});

	it('leaves sibling content outside the Provider untouched across the flip', () => {
		const m = mount(ProviderChildrenDialectFlipWithSiblings);
		const before = m.container.querySelector('.before');
		const after = m.container.querySelector('.after');
		expect(before?.textContent).toBe('before');
		expect(after?.textContent).toBe('after');

		m.click('.toggle');

		// Same nodes, still in place: only the Provider's own range was rebuilt.
		expect(m.container.querySelector('.before')).toBe(before);
		expect(m.container.querySelector('.after')).toBe(after);
		expect(m.container.querySelector('.val')?.textContent).toBe('ctx');

		m.unmount();
	});
});
