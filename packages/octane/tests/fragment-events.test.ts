import { describe, expect, it, vi } from 'vitest';
import type { FragmentInstance } from 'octane';
import { mount } from './_helpers';
import {
	EmptyFragment,
	SingleChild,
	TwoChildren,
} from './conformance/_fixtures/fragment-refs-events.tsrx';
import { FutureChildren } from './conformance/_fixtures/fragment-future.tsrx';

describe('Fragment event listener signals', () => {
	for (const initiallyAborted of [false, true]) {
		for (const capture of [false, true]) {
			it(`can re-register a callback after abort (initially aborted: ${initiallyAborted}, capture: ${capture})`, () => {
				const fragRef: { current: FragmentInstance | null } = { current: null };
				const r = mount(TwoChildren, { fragRef });
				const first = new AbortController();
				const second = new AbortController();
				const seen: string[] = [];
				const listener = (event: Event) => seen.push((event.currentTarget as Element).id);
				try {
					if (initiallyAborted) first.abort();
					fragRef.current!.addEventListener('click', listener, { signal: first.signal, capture });
					r.click('#a');
					expect(seen).toEqual(initiallyAborted ? [] : ['a']);
					first.abort();
					r.click('#a');
					r.click('#b');
					expect(seen).toEqual(initiallyAborted ? [] : ['a']);
					fragRef.current!.addEventListener('click', listener, { signal: second.signal, capture });
					r.click('#a');
					r.click('#b');
					expect(seen).toEqual(initiallyAborted ? ['a', 'b'] : ['a', 'a', 'b']);
					second.abort();
					r.click('#a');
					r.click('#b');
					expect(seen).toEqual(initiallyAborted ? ['a', 'b'] : ['a', 'a', 'b']);
				} finally {
					first.abort();
					second.abort();
					r.unmount();
				}
			});
		}
	}

	it('keeps the signal from the first registration when a duplicate is added', () => {
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(SingleChild, { fragRef });
		const first = new AbortController();
		const duplicate = new AbortController();
		let count = 0;
		const listener = () => count++;
		try {
			fragRef.current!.addEventListener('click', listener, { signal: first.signal });
			fragRef.current!.addEventListener('click', listener, { signal: duplicate.signal });
			duplicate.abort();
			r.click('#k');
			expect(count).toBe(1);
			first.abort();
			r.click('#k');
			expect(count).toBe(1);
		} finally {
			first.abort();
			duplicate.abort();
			r.unmount();
		}
	});

	it('detaches a signaled listener on unmount before the signal is aborted', () => {
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(SingleChild, { fragRef });
		const controller = new AbortController();
		const button = r.find('#k') as HTMLButtonElement;
		let count = 0;
		fragRef.current!.addEventListener('click', () => count++, { signal: controller.signal });
		button.click();
		expect(count).toBe(1);
		r.unmount();
		button.click();
		expect(count).toBe(1);
		controller.abort();
		button.click();
		expect(count).toBe(1);
	});

	it('can re-register an object listener after explicit removal and abort', () => {
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(SingleChild, { fragRef });
		const first = new AbortController();
		const second = new AbortController();
		let count = 0;
		const listener = { handleEvent: () => count++ };
		try {
			fragRef.current!.addEventListener('click', listener, { signal: first.signal, capture: true });
			fragRef.current!.removeEventListener('click', listener, true);
			first.abort();
			fragRef.current!.addEventListener('click', listener, {
				signal: second.signal,
				capture: true,
			});
			r.click('#k');
			expect(count).toBe(1);
			second.abort();
			r.click('#k');
			expect(count).toBe(1);
		} finally {
			first.abort();
			second.abort();
			r.unmount();
		}
	});

	it('aborts capture and bubble registrations independently', () => {
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(SingleChild, { fragRef });
		const capture = new AbortController();
		const bubble = new AbortController();
		let count = 0;
		const listener = () => count++;
		try {
			fragRef.current!.addEventListener('click', listener, {
				signal: capture.signal,
				capture: true,
			});
			fragRef.current!.addEventListener('click', listener, { signal: bubble.signal });
			r.click('#k');
			expect(count).toBe(2);
			capture.abort();
			r.click('#k');
			expect(count).toBe(3);
			fragRef.current!.addEventListener('click', listener, true);
			bubble.abort();
			r.click('#k');
			expect(count).toBe(4);
		} finally {
			capture.abort();
			bubble.abort();
			r.unmount();
		}
	});

	it('keeps the registered options when the caller changes them before adding a child', () => {
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(FutureChildren, { fragRef });
		const first = new AbortController();
		const second = new AbortController();
		const options = { capture: true, signal: first.signal };
		const seen: string[] = [];
		const listener = (event: Event) => seen.push((event.currentTarget as Element).id);
		try {
			fragRef.current!.addEventListener('click', listener, options);
			options.capture = false;
			options.signal = second.signal;
			r.click('#toggle');
			second.abort();
			r.click('#a');
			r.click('#b');
			expect(seen).toEqual(['a', 'b']);
			fragRef.current!.removeEventListener('click', listener, true);
			r.click('#a');
			r.click('#b');
			expect(seen).toEqual(['a', 'b']);
		} finally {
			first.abort();
			second.abort();
			r.unmount();
		}
	});

	it('applies a replacement registration to children inserted after abort', () => {
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(FutureChildren, { fragRef });
		const first = new AbortController();
		const second = new AbortController();
		const seen: string[] = [];
		const listener = (event: Event) => seen.push((event.currentTarget as Element).id);
		try {
			fragRef.current!.addEventListener('click', listener, { signal: first.signal });
			first.abort();
			r.click('#toggle');
			r.click('#a');
			r.click('#b');
			expect(seen).toEqual([]);
			r.click('#toggle');
			fragRef.current!.addEventListener('click', listener, { signal: second.signal });
			r.click('#toggle');
			r.click('#a');
			r.click('#b');
			expect(seen).toEqual(['a', 'b']);
			second.abort();
			r.click('#a');
			r.click('#b');
			expect(seen).toEqual(['a', 'b']);
		} finally {
			first.abort();
			second.abort();
			r.unmount();
		}
	});

	// With no fragment listener, a bubbling dispatchEvent goes straight to the
	// parent; any registration routes it through a fragment-local target.
	it('stops counting a registration as a listener once its signal aborts', () => {
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(SingleChild, { fragRef });
		const parent = r.find('#parent')!;
		const aborted = new AbortController();
		const live = new AbortController();
		const targets: boolean[] = [];
		const record = (event: Event) => targets.push(event.target === parent);
		const dispatch = () => fragRef.current!.dispatchEvent(new Event('ping', { bubbles: true }));
		parent.addEventListener('ping', record);
		try {
			aborted.abort();
			fragRef.current!.addEventListener('ping', () => {}, { signal: aborted.signal });
			dispatch();
			fragRef.current!.addEventListener('ping', () => {}, { signal: live.signal });
			dispatch();
			live.abort();
			dispatch();
			expect(targets).toEqual([true, false, true]);
		} finally {
			live.abort();
			parent.removeEventListener('ping', record);
			r.unmount();
		}
	});

	// No children, so the only abort listeners on the signal are the fragment's.
	it('releases its abort handlers on removal and unmount', () => {
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(EmptyFragment, { fragRef });
		const controller = new AbortController();
		const added = vi.spyOn(controller.signal, 'addEventListener');
		const removed = vi.spyOn(controller.signal, 'removeEventListener');
		const removedListener = () => {};
		try {
			fragRef.current!.addEventListener('click', removedListener, { signal: controller.signal });
			fragRef.current!.addEventListener('click', () => {}, { signal: controller.signal });
			fragRef.current!.removeEventListener('click', removedListener);
			r.unmount();
			const handlers = added.mock.calls.filter(([type]) => type === 'abort').map(([, h]) => h);
			const released = removed.mock.calls.filter(([type]) => type === 'abort').map(([, h]) => h);
			expect(handlers.length).toBeGreaterThan(0);
			expect(new Set(released)).toEqual(new Set(handlers));
		} finally {
			controller.abort();
		}
	});
});
