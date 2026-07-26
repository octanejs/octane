import { describe, it, expect, vi } from 'vitest';
import { mount } from './_helpers';
import {
	ProviderChildrenDialectFlip,
	ProviderChildrenDialectFlipWithState,
	ProviderChildrenDialectFlipWithSiblings,
	ProviderDialectFlipCleanupThrows,
	IfBranchSwapCleanupThrows,
	ProviderRefFlipUnderSuspense,
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

	it('routes a cleanup that throws during the flip to the enclosing boundary', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const m = mount(ProviderDialectFlipCleanupThrows);
		try {
			expect(m.container.querySelector('.throwing')).not.toBe(null);

			m.click('.toggle');

			// The remount tears the old children down mid-render. The boundary has to receive the
			// cleanup's own error — which also means the Provider stopped rendering once the
			// teardown disposed its block, instead of writing children into the catch range.
			expect(m.container.querySelector('.caught')?.textContent).toBe('cleanup-boom');
			expect(error.mock.calls.filter((c) => String(c[0]).includes('cleanup-boom'))).toHaveLength(0);
		} finally {
			error.mockRestore();
			m.unmount();
		}
	});

	it('handles that cleanup throw the same way an ordinary branch swap does', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const m = mount(IfBranchSwapCleanupThrows);
		try {
			m.click('.toggle');

			// The control: an `@if` swap deleting the identical component. It reaches the boundary
			// too, so the Provider flip is not inventing its own routing. This arm asserts only
			// that the boundary engages — `@if` currently surfaces a follow-on DOM error rather
			// than the cleanup's own, a separate pre-existing gap that is not this PR's to close.
			expect(m.container.querySelector('.caught')).not.toBe(null);
			expect(error.mock.calls.filter((c) => String(c[0]).includes('cleanup-boom'))).toHaveLength(0);
		} finally {
			error.mockRestore();
			m.unmount();
		}
	});

	it('keeps a ref inside the children attached across the flip and detached on hide', () => {
		const calls: string[] = [];
		const cbRef = (el: Element | null) => calls.push(el === null ? 'detach' : 'attach');
		const fulfilled = Object.assign(Promise.resolve('a'), { status: 'fulfilled', value: 'a' });
		const m = mount(ProviderRefFlipUnderSuspense as any, { promise: fulfilled, cbRef });
		try {
			expect(calls).toEqual(['attach']);

			// The flip remounts the children, so the ref detaches from the old element and
			// attaches to the new one — no dangling attach, no missed detach.
			m.click('.toggle');
			expect(calls).toEqual(['attach', 'detach', 'attach']);

			// Hiding the boundary detaches it once. The scope was rebuilt by the flip, so this
			// exercises the hide walk against the post-flip scope rather than the original.
			m.update(ProviderRefFlipUnderSuspense as any, {
				promise: Object.assign(new Promise(() => {}), { status: 'pending' }),
				cbRef,
			});
			expect(calls).toEqual(['attach', 'detach', 'attach', 'detach']);
		} finally {
			m.unmount();
		}
	});
});
