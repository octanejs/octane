// FragmentInstance.observeUsing / unobserveUsing / getClientRects /
// getRootNode — React canary parity.
//
// observeUsing / unobserveUsing forward the observer call to every direct
// fragment child. getClientRects concatenates each child's rects in tree
// order. getRootNode delegates to the first child (falling back to the
// start marker's document when the fragment has no children) so tooltip
// libraries can resolve the right ownerDocument / ShadowRoot.
import { describe, it, expect, vi } from 'vitest';
import { mount } from '../_helpers';
import { FragmentInstance } from '../../src/index.js';
import { ThreeSiblings } from './_fixtures/fragment-refs-observers.tsrx';
import { TextOnly } from './_fixtures/fragment-refs-misc.tsrx';
import { EmptyFragment } from './_fixtures/fragment-refs-events.tsrx';

function makeRef(): { current: FragmentInstance | null } {
	return { current: null };
}

// Mock observer that records observe/unobserve targets. Stand-in for
// IntersectionObserver / ResizeObserver — happy-dom's implementations
// don't fire real callbacks but our contract only requires that the
// .observe()/.unobserve() call routing is correct.
function makeMockObserver() {
	const observed: Element[] = [];
	const unobserved: Element[] = [];
	return {
		observed,
		unobserved,
		observe(t: Element) {
			observed.push(t);
		},
		unobserve(t: Element) {
			unobserved.push(t);
		},
	};
}

describe('FragmentInstance.observeUsing / unobserveUsing', () => {
	it('observeUsing forwards .observe to every direct fragment child', () => {
		const fragRef = makeRef();
		const r = mount(ThreeSiblings, { fragRef });
		const obs = makeMockObserver();
		fragRef.current!.observeUsing(obs);
		expect(obs.observed.map((e) => e.id)).toEqual(['x', 'y', 'z']);
		r.unmount();
	});

	it('unobserveUsing forwards .unobserve to every direct fragment child', () => {
		const fragRef = makeRef();
		const r = mount(ThreeSiblings, { fragRef });
		const obs = makeMockObserver();
		fragRef.current!.observeUsing(obs);
		fragRef.current!.unobserveUsing(obs);
		expect(obs.unobserved.map((e) => e.id)).toEqual(['x', 'y', 'z']);
		r.unmount();
	});

	// Per ReactDOMFragmentRefs-test.js:1255.
	it('warns without unobserving when the observer was never registered', () => {
		const fragRef = makeRef();
		const r = mount(ThreeSiblings, { fragRef });
		const observer = makeMockObserver();
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			fragRef.current!.unobserveUsing(observer);
			expect(error).toHaveBeenCalledWith(
				'You are calling unobserveUsing() with an observer that is not being observed with this fragment ' +
					'instance. First attach the observer with observeUsing()',
			);
			expect(observer.unobserved).toEqual([]);
		} finally {
			error.mockRestore();
			r.unmount();
		}
	});

	// Per ReactDOMFragmentRefs-test.js:1255.
	it('warns without touching a different observer while keeping the registered one', () => {
		const fragRef = makeRef();
		const r = mount(ThreeSiblings, { fragRef });
		const registered = makeMockObserver();
		const unrelated = makeMockObserver();
		fragRef.current!.observeUsing(registered);
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			fragRef.current!.unobserveUsing(unrelated);
			expect(error).toHaveBeenCalledOnce();
			expect(unrelated.unobserved).toEqual([]);
			fragRef.current!.unobserveUsing(registered);
			expect(registered.unobserved.map((element) => element.id)).toEqual(['x', 'y', 'z']);
		} finally {
			error.mockRestore();
			r.unmount();
		}
	});

	// Per ReactDOMFragmentRefs-test.js:2774.
	it('warns when an observer is attached to a fragment containing only text', () => {
		const fragRef = makeRef();
		const r = mount(TextOnly, { fragRef });
		const observer = makeMockObserver();
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			fragRef.current!.observeUsing(observer);
			expect(error).toHaveBeenCalledWith(
				'observeUsing() was called on a FragmentInstance with only text children. ' +
					'Observers do not work on text nodes.',
			);
			expect(observer.observed).toEqual([]);
		} finally {
			error.mockRestore();
			r.unmount();
		}
	});

	it('does not warn when an observer is attached to an empty fragment', () => {
		const fragRef = makeRef();
		const r = mount(EmptyFragment, { fragRef });
		const observer = makeMockObserver();
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			fragRef.current!.observeUsing(observer);
			expect(error).not.toHaveBeenCalled();
			expect(observer.observed).toEqual([]);
		} finally {
			error.mockRestore();
			r.unmount();
		}
	});
});

describe('FragmentInstance.getClientRects', () => {
	it('returns the concatenated rects of every direct fragment child in tree order', () => {
		const fragRef = makeRef();
		const r = mount(ThreeSiblings, { fragRef });
		// happy-dom returns an empty DOMRectList for un-layouted elements,
		// so to assert ON the concatenation contract we stub each child's
		// getClientRects to return a unique sentinel rect — then verify the
		// wrapper concatenates them in tree order.
		const ids = ['x', 'y', 'z'];
		for (let i = 0; i < ids.length; i++) {
			const el = r.find('#' + ids[i]);
			const sentinel = { __id: ids[i], width: i, height: i } as unknown as DOMRect;
			// Override on the instance — original DOMRectList remains on the
			// prototype, untouched.
			(el as any).getClientRects = () => [sentinel];
		}
		const rects = fragRef.current!.getClientRects();
		expect(rects.map((r) => (r as any).__id)).toEqual(['x', 'y', 'z']);
		r.unmount();
	});
});

describe('FragmentInstance.getRootNode', () => {
	it('returns the document when the fragment is rendered into the main tree', () => {
		const fragRef = makeRef();
		const r = mount(ThreeSiblings, { fragRef });
		expect(fragRef.current!.getRootNode()).toBe(document);
		r.unmount();
	});
});
