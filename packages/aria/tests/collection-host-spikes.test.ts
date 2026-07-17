import { describe, it, expect } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	DualMountChildren,
	DetachedPortal,
	HiddenCopyShape,
} from './_fixtures/collection-host.tsx';

// Phase-0 spikes for the Phase-4 collection host (docs/aria-migration-plan.md §2a).
// These pin the two octane behaviors the detached-real-DOM collection engine will
// stand on. If either regresses, the RAC collection design needs revisiting BEFORE
// Phase 4 — that's why they're committed tests, not throwaway probes.

describe('collection-host spike: same children at two positions', () => {
	it('renders independent DOM per position and updates both on state change', async () => {
		const r = mount(DualMountChildren);
		const a = r.container.querySelector('[data-copy="a"] span')!;
		const b = r.container.querySelector('[data-copy="b"] span')!;
		expect(a.textContent).toBe('n=0');
		expect(b.textContent).toBe('n=0');
		expect(a).not.toBe(b); // two positions → two element instances

		await act(() => {
			r.container.querySelector('button')!.click();
		});
		expect(r.container.querySelector('[data-copy="a"] span')!.textContent).toBe('n=1');
		expect(r.container.querySelector('[data-copy="b"] span')!.textContent).toBe('n=1');
		r.unmount();
	});
});

describe('collection-host spike: createPortal into a detached container', () => {
	it('renders, updates with keyed identity, and tears down off-DOM', async () => {
		const target = document.createElement('div');
		const r = mount(DetachedPortal, { target });

		// Initial render lands in the detached container (never attached to the document).
		expect(target.isConnected).toBe(false);
		const ul = target.querySelector('ul')!;
		expect(ul).not.toBe(null);
		expect([...ul.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['a', 'b', 'c']);

		// Keyed reorder: same nodes, new order (document order is the collection's truth).
		const liA = ul.querySelector('[data-k="a"]')!;
		const liC = ul.querySelector('[data-k="c"]')!;
		await act(() => {
			(r.container.querySelector('[data-action="reorder"]') as HTMLElement).click();
		});
		expect([...ul.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['c', 'a', 'b']);
		expect(ul.querySelector('[data-k="a"]')).toBe(liA);
		expect(ul.querySelector('[data-k="c"]')).toBe(liC);

		// Removal drops rows.
		await act(() => {
			(r.container.querySelector('[data-action="drop"]') as HTMLElement).click();
		});
		expect([...ul.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['a']);

		// Unmount clears the portal range from the detached container.
		r.unmount();
		expect(target.querySelector('ul')).toBe(null);
	});
});

describe('collection-host spike: hidden detached copy + live copy of the same children', () => {
	it('both copies render and track the same state', async () => {
		const target = document.createElement('div');
		const r = mount(HiddenCopyShape, { target });

		const hidden = target.querySelector('[data-hidden-copy] span')!;
		const live = r.container.querySelector('[data-live] span')!;
		expect(hidden.textContent).toBe('one');
		expect(live.textContent).toBe('one');
		expect(hidden).not.toBe(live);

		await act(() => {
			r.container.querySelector('button')!.click();
		});
		expect(target.querySelector('[data-hidden-copy] span')!.getAttribute('data-item')).toBe('two');
		expect(r.container.querySelector('[data-live] span')!.getAttribute('data-item')).toBe('two');
		r.unmount();
		expect(target.querySelector('[data-hidden-copy]')).toBe(null);
	});
});
