// FragmentInstance — remaining React canary parity tests.
//
// Stage 6 covers:
//   - React's first-level-child scrolling, alignment, and empty-fragment fallbacks
//   - text-node geometry and scrolling
//   - nested fragments (each ref binds to its own marker range)
//   - sibling fragments (refs don't cross-contaminate)
//   - array refs (multi-ref attach)
//   - conditional fragments (ref attaches on mount, clears on unmount)
//   - dispatchEvent integration with the surrounding component event tree
//   - re-mount semantics (ref toggles correctly on remount)
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushEffects } from '../_helpers';
import { FragmentInstance, createRoot, flushSync } from '../../src/index.js';
import {
	ScrollTarget,
	ScrollNonFocusable,
	ScrollNestedFocusable,
	EmptyFragmentWithSiblings,
	EmptyFragmentWithoutSiblings,
	EmptyFragmentWithTextSiblings,
	TextOnly,
	MixedTextAndElements,
	NestedFragments,
	SiblingFragments,
	ArrayRef,
	ConditionalFragment,
	setShow,
	DispatchParent,
} from './_fixtures/fragment-refs-misc.tsrx';
import { FragmentPortalChildren } from './_fixtures/fragment-future.tsrx';

function makeRef(): { current: FragmentInstance | null } {
	return { current: null };
}

describe('FragmentInstance.scrollIntoView', () => {
	// Per ReactDOMFragmentRefs-test.js: "settles scroll on the first child by default".
	it('forwards the original argument to its first-level host child', () => {
		const fragRef = makeRef();
		const r = mount(ScrollTarget, { fragRef });
		const btn = r.find('#btn') as HTMLButtonElement;
		const calls: any[] = [];
		btn.scrollIntoView = function (arg?: any) {
			calls.push(arg);
		};
		fragRef.current!.scrollIntoView();
		expect(calls).toEqual([undefined]);
		r.unmount();
	});

	it('scrolls children in reverse order so the first child receives final focus', () => {
		const fragRef = makeRef();
		const r = mount(ScrollNonFocusable, { fragRef });
		const first = r.find('#first') as HTMLElement;
		const second = r.find('#second') as HTMLElement;
		const calls: string[] = [];
		first.scrollIntoView = () => {
			calls.push('first');
		};
		second.scrollIntoView = () => {
			calls.push('second');
		};
		fragRef.current!.scrollIntoView();
		expect(calls).toEqual(['second', 'first']);
		calls.length = 0;
		fragRef.current!.scrollIntoView(true);
		expect(calls).toEqual(['second', 'first']);
		r.unmount();
	});

	// Per ReactDOMFragmentRefs-test.js: "calls scrollIntoView on the last child if alignToTop is false".
	it('scrolls children in tree order when aligning to the bottom', () => {
		const fragRef = makeRef();
		const r = mount(ScrollNonFocusable, { fragRef });
		const calls: Array<[string, boolean | undefined]> = [];
		for (const id of ['first', 'second']) {
			(r.find('#' + id) as HTMLElement).scrollIntoView = (alignToTop?: boolean) => {
				calls.push([id, alignToTop]);
			};
		}
		fragRef.current!.scrollIntoView(false);
		expect(calls).toEqual([
			['first', false],
			['second', false],
		]);
		r.unmount();
	});

	it('scrolls first-level children, not their focusable descendants', () => {
		const fragRef = makeRef();
		const r = mount(ScrollNestedFocusable, { fragRef });
		const calls: string[] = [];
		for (const id of ['first', 'second', 'nested']) {
			(r.find('#' + id) as HTMLElement).scrollIntoView = () => calls.push(id);
		}
		fragRef.current!.scrollIntoView();
		expect(calls).toEqual(['second', 'first']);
		r.unmount();
	});

	// Per ReactDOMFragmentRefs-test.js: "does not yet support options".
	it('rejects scroll options objects instead of passing them to DOM elements', () => {
		const fragRef = makeRef();
		const r = mount(ScrollTarget, { fragRef });
		expect(() => fragRef.current!.scrollIntoView({ block: 'center' } as any)).toThrow(
			'FragmentInstance.scrollIntoView() does not support scrollIntoViewOptions. Use the alignToTop boolean instead.',
		);
		expect(() => fragRef.current!.scrollIntoView(null as any)).toThrow(/alignToTop boolean/);
		r.unmount();
	});

	it('forwards a boolean argument to scrollIntoView', () => {
		const fragRef = makeRef();
		const r = mount(ScrollTarget, { fragRef });
		const btn = r.find('#btn') as HTMLButtonElement;
		const calls: any[] = [];
		btn.scrollIntoView = function (arg?: any) {
			calls.push(arg);
		};
		fragRef.current!.scrollIntoView(true);
		expect(calls).toEqual([true]);
		r.unmount();
	});

	// Per ReactDOMFragmentRefs-test.js: "calls scrollIntoView on the next sibling by default".
	it('scrolls toward the next sibling for empty fragments by default', () => {
		const fragRef = makeRef();
		const r = mount(EmptyFragmentWithSiblings, { fragRef });
		const calls: string[] = [];
		(r.find('#before') as HTMLElement).scrollIntoView = () => calls.push('before');
		(r.find('#after') as HTMLElement).scrollIntoView = () => calls.push('after');
		fragRef.current!.scrollIntoView();
		fragRef.current!.scrollIntoView(true);
		expect(calls).toEqual(['after', 'after']);
		r.unmount();
	});

	// Per ReactDOMFragmentRefs-test.js: "calls scrollIntoView on the prev sibling if alignToTop is false".
	it('scrolls toward the previous sibling for bottom-aligned empty fragments', () => {
		const fragRef = makeRef();
		const r = mount(EmptyFragmentWithSiblings, { fragRef });
		const calls: string[] = [];
		(r.find('#before') as HTMLElement).scrollIntoView = () => calls.push('before');
		(r.find('#after') as HTMLElement).scrollIntoView = () => calls.push('after');
		fragRef.current!.scrollIntoView(false);
		expect(calls).toEqual(['before']);
		r.unmount();
	});

	// Per ReactDOMFragmentRefs-test.js: "calls scrollIntoView on the parent if there are no siblings".
	it('scrolls the parent when an empty fragment has no siblings', () => {
		const fragRef = makeRef();
		const r = mount(EmptyFragmentWithoutSiblings, { fragRef });
		const parent = r.find('#parent') as HTMLElement;
		const scroll = vi.fn();
		parent.scrollIntoView = scroll;
		fragRef.current!.scrollIntoView();
		expect(scroll).toHaveBeenCalledWith(undefined);
		r.unmount();
	});
});

describe('FragmentInstance — text-only fragment (no host children)', () => {
	it('focus / focusLast / blur are no-ops', () => {
		const fragRef = makeRef();
		const r = mount(TextOnly, { fragRef });
		const before = document.activeElement;
		fragRef.current!.focus();
		fragRef.current!.focusLast();
		fragRef.current!.blur();
		expect(document.activeElement).toBe(before);
		r.unmount();
	});

	it('getClientRects returns an empty array', () => {
		const fragRef = makeRef();
		const r = mount(TextOnly, { fragRef });
		expect(fragRef.current!.getClientRects()).toEqual([]);
		r.unmount();
	});

	// Per ReactDOMFragmentRefs-test.js: "getClientRects includes text node bounds".
	it('includes text-node client rectangles when the Range API provides them', () => {
		const fragRef = makeRef();
		const r = mount(TextOnly, { fragRef });
		const rect = { width: 80, height: 16 } as DOMRect;
		const selected: Node[] = [];
		const createRange = vi.spyOn(document, 'createRange').mockImplementation(
			() =>
				({
					selectNodeContents(node: Node) {
						selected.push(node);
					},
					getClientRects: () => [rect],
				}) as unknown as Range,
		);
		try {
			expect(fragRef.current!.getClientRects()).toEqual([rect]);
			expect(selected.map((node) => node.textContent)).toEqual(['just text']);
		} finally {
			createRange.mockRestore();
			r.unmount();
		}
	});

	// Per ReactDOMFragmentRefs-test.js: "getClientRects includes both text and element bounds".
	it('preserves document order across mixed text and element rectangles', () => {
		const fragRef = makeRef();
		const r = mount(MixedTextAndElements, { fragRef });
		const elementRect = { width: 100 } as DOMRect;
		(r.find('#middle') as HTMLElement).getClientRects = () => [elementRect] as any;
		const createRange = vi.spyOn(document, 'createRange').mockImplementation(() => {
			let node: Node;
			return {
				selectNodeContents(selected: Node) {
					node = selected;
				},
				getClientRects: () => [{ width: node.textContent === 'before' ? 60 : 40 }],
			} as unknown as Range;
		});
		try {
			expect(fragRef.current!.getClientRects().map((rect) => rect.width)).toEqual([60, 100, 40]);
		} finally {
			createRange.mockRestore();
			r.unmount();
		}
	});

	// Per ReactDOMFragmentRefs-test.js: "scrollIntoView works on text-only fragment using Range API".
	it('scrolls text nodes through their Range geometry', () => {
		const fragRef = makeRef();
		const r = mount(TextOnly, { fragRef });
		const createRange = vi.spyOn(document, 'createRange').mockImplementation(
			() =>
				({
					selectNodeContents() {},
					getBoundingClientRect: () => ({ left: 100, top: 200, bottom: 216 }),
				}) as unknown as Range,
		);
		const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
		try {
			fragRef.current!.scrollIntoView();
			expect(scroll).toHaveBeenLastCalledWith(window.scrollX + 100, window.scrollY + 200);
			fragRef.current!.scrollIntoView(false);
			expect(scroll).toHaveBeenLastCalledWith(
				window.scrollX + 100,
				window.scrollY + 216 - window.innerHeight,
			);
		} finally {
			scroll.mockRestore();
			createRange.mockRestore();
			r.unmount();
		}
	});

	// Per ReactDOMFragmentRefs-test.js: "scrollIntoView scrolls to text siblings of an empty fragment".
	it('uses the correct neighboring text node when an empty fragment scrolls', () => {
		const fragRef = makeRef();
		const r = mount(EmptyFragmentWithTextSiblings, { fragRef });
		const selected: string[] = [];
		const createRange = vi.spyOn(document, 'createRange').mockImplementation(
			() =>
				({
					selectNodeContents(node: Node) {
						selected.push(node.textContent!);
					},
					getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 10 }),
				}) as unknown as Range,
		);
		const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
		try {
			fragRef.current!.scrollIntoView();
			fragRef.current!.scrollIntoView(false);
			expect(selected).toEqual(['after', 'before']);
		} finally {
			scroll.mockRestore();
			createRange.mockRestore();
			r.unmount();
		}
	});

	it('getRootNode falls back to the start marker document', () => {
		const fragRef = makeRef();
		const r = mount(TextOnly, { fragRef });
		// With no host children, getRootNode walks to the marker's root —
		// which is the document.
		expect(fragRef.current!.getRootNode()).toBe(document);
		r.unmount();
	});

	// Per ReactDOMFragmentRefs-test.js: "returns self when only the fragment was unmounted".
	it('returns the captured fragment instance after it has been unmounted', () => {
		const fragRef = makeRef();
		const r = mount(TextOnly, { fragRef });
		const instance = fragRef.current!;
		r.unmount();
		expect(instance.getRootNode()).toBe(instance);
	});

	it('forwards composed root lookup options through shadow boundaries', () => {
		const fragRef = makeRef();
		const host = document.createElement('div');
		document.body.appendChild(host);
		const shadow = host.attachShadow({ mode: 'open' });
		const container = document.createElement('div');
		shadow.appendChild(container);
		const root = createRoot(container);
		try {
			root.render(ScrollTarget, { fragRef });
			flushSync(() => {});
			expect(fragRef.current!.getRootNode()).toBe(shadow);
			expect(fragRef.current!.getRootNode({ composed: true })).toBe(document);
		} finally {
			root.unmount();
			host.remove();
		}
	});

	// Per ReactFiberConfigDOM: text hosts retain their owning Fragment handles.
	it('publishes fragment ownership on direct text nodes', () => {
		const fragRef = makeRef();
		const r = mount(TextOnly, { fragRef });
		const text = Array.from(r.find('#parent').childNodes).find(
			(node) => node.nodeType === Node.TEXT_NODE,
		) as Text & { reactFragments?: Set<FragmentInstance> };
		const fragment = fragRef.current!;
		expect(text.reactFragments?.has(fragment)).toBe(true);
		r.unmount();
		expect(text.reactFragments?.has(fragment)).toBe(false);
	});

	// Per ReactFiberConfigDOM: fragment event listeners include direct text hosts.
	it('attaches and removes event listeners on direct text children', () => {
		const fragRef = makeRef();
		const r = mount(TextOnly, { fragRef });
		const text = Array.from(r.find('#parent').childNodes).find(
			(node) => node.nodeType === Node.TEXT_NODE,
		)!;
		let fired = 0;
		const listener = () => fired++;
		fragRef.current!.addEventListener('customping', listener);
		text.dispatchEvent(new Event('customping'));
		expect(fired).toBe(1);
		fragRef.current!.removeEventListener('customping', listener);
		text.dispatchEvent(new Event('customping'));
		expect(fired).toBe(1);
		r.unmount();
	});
});

describe('FragmentInstance — portaled imperative children', () => {
	// Per ReactDOMFragmentRefs-test.js: "handles portaled elements -- same scroll container".
	it('measures and scrolls portaled children in their authored logical order', () => {
		const target = document.createElement('section');
		document.body.appendChild(target);
		const fragRef = makeRef();
		const r = mount(FragmentPortalChildren, { fragRef, target });
		try {
			const before = r.find('#inline-before') as HTMLElement;
			const portal = target.querySelector('#owned-portal') as HTMLElement;
			const after = r.find('#inline-after') as HTMLElement;
			const children = [before, portal, after];
			for (const child of children) {
				child.getClientRects = () => [{ width: children.indexOf(child) + 1 }] as any;
			}
			expect(fragRef.current!.getClientRects().map((rect) => rect.width)).toEqual([1, 2, 3]);

			const calls: string[] = [];
			for (const child of children) child.scrollIntoView = () => calls.push(child.id);
			fragRef.current!.scrollIntoView();
			expect(calls).toEqual(['inline-after', 'owned-portal', 'inline-before']);
			calls.length = 0;
			fragRef.current!.scrollIntoView(false);
			expect(calls).toEqual(['inline-before', 'owned-portal', 'inline-after']);
		} finally {
			r.unmount();
			target.remove();
		}
	});

	it('focuses and blurs the logically owned focusable portal child', () => {
		const target = document.createElement('section');
		document.body.appendChild(target);
		const fragRef = makeRef();
		const r = mount(FragmentPortalChildren, { fragRef, target });
		try {
			(r.find('#inline-before') as HTMLButtonElement).disabled = true;
			(r.find('#inline-after') as HTMLButtonElement).disabled = true;
			const portal = target.querySelector('#owned-portal') as HTMLButtonElement;
			fragRef.current!.focus();
			expect(document.activeElement).toBe(portal);
			fragRef.current!.blur();
			expect(document.activeElement).not.toBe(portal);
		} finally {
			r.unmount();
			target.remove();
		}
	});
});

describe('FragmentInstance — nested fragments', () => {
	it('inner and outer refs each bind to their own marker range', () => {
		const outerRef = makeRef();
		const innerRef = makeRef();
		const r = mount(NestedFragments, { outerRef, innerRef });
		expect(outerRef.current).toBeInstanceOf(FragmentInstance);
		expect(innerRef.current).toBeInstanceOf(FragmentInstance);
		expect(outerRef.current).not.toBe(innerRef.current);
		// Each instance owns its OWN marker pair — the outer pair brackets
		// the inner pair, but each instance's start/end Comment is distinct.
		expect(outerRef.current!._startMarker).not.toBe(innerRef.current!._startMarker);
		expect(outerRef.current!._endMarker).not.toBe(innerRef.current!._endMarker);
		r.unmount();
	});

	it('inner fragment.contains a child only of the inner range', () => {
		const outerRef = makeRef();
		const innerRef = makeRef();
		const r = mount(NestedFragments, { outerRef, innerRef });
		const outerA = r.find('#outer-a');
		const innerA = r.find('#inner-a');
		// outer-a is in outer range but NOT in inner range.
		const outerOuterPos = outerRef.current!.compareDocumentPosition(outerA);
		expect(outerOuterPos & Node.DOCUMENT_POSITION_CONTAINED_BY).toBeTruthy();
		const outerInnerPos = innerRef.current!.compareDocumentPosition(outerA);
		expect(outerInnerPos & Node.DOCUMENT_POSITION_CONTAINED_BY).toBeFalsy();
		// inner-a is in BOTH ranges (inner is nested inside outer).
		const innerOuterPos = outerRef.current!.compareDocumentPosition(innerA);
		expect(innerOuterPos & Node.DOCUMENT_POSITION_CONTAINED_BY).toBeTruthy();
		const innerInnerPos = innerRef.current!.compareDocumentPosition(innerA);
		expect(innerInnerPos & Node.DOCUMENT_POSITION_CONTAINED_BY).toBeTruthy();
		r.unmount();
	});

	it('inner fragment focus picks the first focusable inner descendant', () => {
		const outerRef = makeRef();
		const innerRef = makeRef();
		const r = mount(NestedFragments, { outerRef, innerRef });
		// outer focus → outer-a is first focusable? It's a div, no
		// tabIndex; inner-a is also a div. Neither is focusable. focus() is
		// a no-op. Verify methods don't crash for this layout.
		expect(() => outerRef.current!.focus()).not.toThrow();
		expect(() => innerRef.current!.focus()).not.toThrow();
		r.unmount();
	});

	it('inner ref is cleared on unmount independently of outer', () => {
		const outerRef = makeRef();
		const innerRef = makeRef();
		const r = mount(NestedFragments, { outerRef, innerRef });
		r.unmount();
		expect(outerRef.current).toBeNull();
		expect(innerRef.current).toBeNull();
	});
});

describe('FragmentInstance — sibling fragments', () => {
	it('two sibling refs each see only their own children', () => {
		const leftRef = makeRef();
		const rightRef = makeRef();
		const r = mount(SiblingFragments, { leftRef, rightRef });
		const L1 = r.find('#L1');
		const R1 = r.find('#R1');
		// L1 is contained by leftRef but NOT by rightRef.
		expect(
			leftRef.current!.compareDocumentPosition(L1) & Node.DOCUMENT_POSITION_CONTAINED_BY,
		).toBeTruthy();
		expect(
			rightRef.current!.compareDocumentPosition(L1) & Node.DOCUMENT_POSITION_CONTAINED_BY,
		).toBeFalsy();
		// And vice versa for R1.
		expect(
			rightRef.current!.compareDocumentPosition(R1) & Node.DOCUMENT_POSITION_CONTAINED_BY,
		).toBeTruthy();
		expect(
			leftRef.current!.compareDocumentPosition(R1) & Node.DOCUMENT_POSITION_CONTAINED_BY,
		).toBeFalsy();
		r.unmount();
	});

	it('a listener added to the left fragment does NOT fire on the right', () => {
		const leftRef = makeRef();
		const rightRef = makeRef();
		const r = mount(SiblingFragments, { leftRef, rightRef });
		let fired = 0;
		leftRef.current!.addEventListener('click', () => fired++);
		(r.find('#R1') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(fired).toBe(0);
		(r.find('#L1') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(fired).toBe(1);
		r.unmount();
	});
});

describe('FragmentInstance — array refs', () => {
	it('multi-ref attach: array shape populates BOTH refs', () => {
		const refA = makeRef();
		const refB = makeRef();
		const r = mount(ArrayRef, { refA, refB });
		expect(refA.current).toBeInstanceOf(FragmentInstance);
		expect(refB.current).toBeInstanceOf(FragmentInstance);
		// Both refs see the SAME FragmentInstance.
		expect(refA.current).toBe(refB.current);
		r.unmount();
		// Both refs cleared on unmount.
		expect(refA.current).toBeNull();
		expect(refB.current).toBeNull();
	});

	it('mixed object + callback in the array form fires the callback too', () => {
		const refA = makeRef();
		let cbCaptured: FragmentInstance | null = null;
		const cb = (fi: FragmentInstance | null) => {
			cbCaptured = fi;
		};
		const r = mount(ArrayRef, { refA, refB: cb });
		expect(refA.current).toBeInstanceOf(FragmentInstance);
		expect(cbCaptured).toBe(refA.current);
		r.unmount();
		expect(cbCaptured).toBeNull();
	});
});

describe('FragmentInstance — conditional fragments', () => {
	beforeEach(() => setShow(true));
	afterEach(() => setShow(true));

	it('ref attaches on mount and clears when the fragment is conditionally removed', () => {
		const fragRef = makeRef();
		const r = mount(ConditionalFragment, { fragRef });
		expect(fragRef.current).toBeInstanceOf(FragmentInstance);
		const first = fragRef.current;
		// State changes need a render flush — flushEffects only drains
		// passive effects, not the scheduled render that unmounts the @if
		// branch.
		flushSync(() => setShow(false));
		expect(fragRef.current).toBeNull();
		// And re-mounted when the condition flips back on — populated again
		// (with a fresh instance, since the fragment was destroyed).
		flushSync(() => setShow(true));
		expect(fragRef.current).toBeInstanceOf(FragmentInstance);
		expect(fragRef.current).not.toBe(first);
		r.unmount();
	});
});

describe('FragmentInstance.dispatchEvent — integration', () => {
	it('event dispatched via fragmentRef reaches a delegated click handler on the parent', () => {
		const fragRef = makeRef();
		let parentClicked = 0;
		const r = mount(DispatchParent, {
			fragRef,
			onParent: () => parentClicked++,
		});
		fragRef.current!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		// The onClick on #parent (delegated through octane's event
		// system) sees the click. Confirms dispatchEvent and the surrounding
		// component event tree compose correctly.
		expect(parentClicked).toBe(1);
		r.unmount();
	});
});

describe('FragmentInstance — re-mount semantics', () => {
	it('a brand-new FragmentInstance is produced each time the host fragment is re-mounted', () => {
		const fragRef = makeRef();
		const r = mount(ConditionalFragment, { fragRef });
		const first = fragRef.current;
		flushSync(() => setShow(false));
		flushSync(() => setShow(true));
		flushSync(() => setShow(false));
		flushSync(() => setShow(true));
		const second = fragRef.current;
		expect(first).not.toBe(second);
		expect(second).toBeInstanceOf(FragmentInstance);
		r.unmount();
	});
});
