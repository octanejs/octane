import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { CleanupRef, LegacyRef, SharedRefList } from './_fixtures/ref-cleanup.tsrx';

describe('callback ref cleanup-return (React 19)', () => {
	it('runs the returned cleanup with the captured node on detach (not ref(null))', () => {
		const attaches: any[] = [];
		const cleanups: any[] = [];
		const r = mount(CleanupRef, {
			onAttach: (el: any) => attaches.push(el),
			onCleanup: (el: any) => cleanups.push(el),
		});

		// Attached on mount; cleanup hasn't run.
		expect(attaches).toHaveLength(1);
		expect(attaches[0]).toBeInstanceOf(HTMLElement);
		expect(cleanups).toHaveLength(0);
		const node = attaches[0];

		// Hide the span → @if detaches the ref → the returned cleanup runs with
		// the node it captured. Critically NOT called with null.
		r.click('#toggle');
		expect(r.findAll('#target')).toHaveLength(0);
		expect(cleanups).toEqual([node]);
		expect(cleanups).not.toContain(null);
		expect(attaches).toHaveLength(1); // no spurious re-attach

		// Show again → fresh attach + fresh cleanup registered (new node).
		r.click('#toggle');
		expect(attaches).toHaveLength(2);
		expect(cleanups).toHaveLength(1); // re-attach must not fire a cleanup

		// Unmount → the latest cleanup runs with the latest node.
		r.unmount();
		expect(cleanups).toHaveLength(2);
		expect(cleanups[1]).toBe(attaches[1]);
	});

	it('pairs cleanups per (ref, element) when ONE callback ref is shared by two list rows', () => {
		// React 19 stores the cleanup per attach site. A single `registerItem`-style
		// callback ref on every @for row therefore holds one cleanup PER ROW: removing
		// row 1 must run row 1's cleanup — not overwrite/steal row 2's.
		const attached: any[] = [];
		const cleaned: any[] = [];
		const register = (el: any) => {
			attached.push(el);
			return () => cleaned.push(el);
		};
		const r = mount(SharedRefList, { register });
		expect(attached).toHaveLength(2);
		const [first, second] = attached;
		expect(first.textContent).toBe('item-1');
		expect(second.textContent).toBe('item-2');

		// Remove the FIRST row → exactly its cleanup runs, with its element.
		r.click('#remove-first');
		expect(cleaned).toEqual([first]);
		expect(attached).toHaveLength(2); // the survivor is not re-attached

		// Unmount → the surviving row's cleanup runs (it wasn't consumed above).
		r.unmount();
		expect(cleaned).toEqual([first, second]);
	});

	it('legacy callback refs (no cleanup return) still receive null on detach', () => {
		const calls: any[] = [];
		const r = mount(LegacyRef, { observe: (el: any) => calls.push(el) });
		expect(calls).toHaveLength(1);
		expect(calls[0]).toBeInstanceOf(HTMLElement);

		r.click('#toggle');
		expect(r.findAll('#target')).toHaveLength(0);
		expect(calls).toContain(null); // legacy detach contract preserved
		r.unmount();
	});
});
