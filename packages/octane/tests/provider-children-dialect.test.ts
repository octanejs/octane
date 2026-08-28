import { describe, it, expect, vi } from 'vitest';
import { createRoot, flushSync } from '../src/index.js';
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

			// The control: an `@if` swap deleting the identical component. The
			// cleanup disposes the old branch through its enclosing boundary, so
			// the swap must stop before mounting into that disposed catch range.
			expect(m.container.querySelector('.caught')?.textContent).toBe('cleanup-boom');
			expect(m.container.querySelector('.other')).toBe(null);
			expect(error.mock.calls.filter((c) => String(c[0]).includes('cleanup-boom'))).toHaveLength(0);
		} finally {
			error.mockRestore();
			m.unmount();
		}
	});

	it('reports the original cleanup error without connecting children abandoned by its catch', () => {
		const failure = new Error('cleanup-boom');
		const lifecycle: string[] = [];
		const onCaughtError = vi.fn();
		const onUncaughtError = vi.fn();
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container, { onCaughtError, onUncaughtError });
		try {
			flushSync(() => root.render(ProviderDialectFlipCleanupThrows, { failure, lifecycle }));
			expect(lifecycle).toEqual(['connect']);

			const toggle = container.querySelector<HTMLButtonElement>('.toggle')!;
			flushSync(() => toggle.click());

			expect(container.querySelector('.caught')?.textContent).toBe(failure.message);
			// The cleanup sends this update to catch before the replacement can commit.
			// Connecting its effect would expose abandoned work and produce another cleanup error.
			expect(lifecycle).toEqual(['connect', 'cleanup']);
			expect(onCaughtError).toHaveBeenCalledTimes(1);
			expect(onCaughtError.mock.calls[0][0]).toBe(failure);
			expect(onUncaughtError).not.toHaveBeenCalled();
			expect(error).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			container.remove();
			error.mockRestore();
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
