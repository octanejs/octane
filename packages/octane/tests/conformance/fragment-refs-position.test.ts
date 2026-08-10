// FragmentInstance.compareDocumentPosition / dispatchEvent — React canary parity.
//
// compareDocumentPosition preserves React's exact containment and empty-fragment
// bitmasks. dispatchEvent distinguishes fragment-local listeners from bubbling
// listeners on surrounding host elements.
import { describe, it, expect } from 'vitest';
import { mount } from '../_helpers';
import { FragmentInstance } from '../../src/index.js';
import {
	SurroundedFragment,
	ParentWithFragmentChild,
	EmptySurroundedFragment,
	NestedPositionFragment,
} from './_fixtures/fragment-refs-position.tsrx';
import { FragmentPortalChildren } from './_fixtures/fragment-future.tsrx';
import { TextOnly } from './_fixtures/fragment-refs-misc.tsrx';

function makeRef(): { current: FragmentInstance | null } {
	return { current: null };
}

describe('FragmentInstance.compareDocumentPosition', () => {
	it('returns PRECEDING for a sibling rendered BEFORE the fragment', () => {
		const fragRef = makeRef();
		const r = mount(SurroundedFragment, { fragRef });
		const before = r.find('#before');
		const flags = fragRef.current!.compareDocumentPosition(before);
		expect(flags & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
		expect(flags & Node.DOCUMENT_POSITION_FOLLOWING).toBeFalsy();
		expect(flags & Node.DOCUMENT_POSITION_CONTAINED_BY).toBeFalsy();
		r.unmount();
	});

	it('returns FOLLOWING for a sibling rendered AFTER the fragment', () => {
		const fragRef = makeRef();
		const r = mount(SurroundedFragment, { fragRef });
		const after = r.find('#after');
		const flags = fragRef.current!.compareDocumentPosition(after);
		expect(flags & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(flags & Node.DOCUMENT_POSITION_PRECEDING).toBeFalsy();
		expect(flags & Node.DOCUMENT_POSITION_CONTAINED_BY).toBeFalsy();
		r.unmount();
	});

	// Per ReactDOMFragmentRefs-test.js: "handles multiple children".
	it('returns exactly CONTAINED_BY for a child inside the fragment', () => {
		const fragRef = makeRef();
		const r = mount(SurroundedFragment, { fragRef });
		const inside = r.find('#inside');
		const flags = fragRef.current!.compareDocumentPosition(inside);
		expect(flags).toBe(Node.DOCUMENT_POSITION_CONTAINED_BY);
		r.unmount();
	});

	it('returns exactly CONTAINED_BY for a descendant of a fragment child', () => {
		const fragRef = makeRef();
		const r = mount(NestedPositionFragment, { fragRef });
		expect(fragRef.current!.compareDocumentPosition(r.find('#nested'))).toBe(
			Node.DOCUMENT_POSITION_CONTAINED_BY,
		);
		r.unmount();
	});

	// Per ReactDOMFragmentRefs-test.js: "compareDocumentPosition works with text children".
	it('reports exact containment for direct text children', () => {
		const fragRef = makeRef();
		const r = mount(TextOnly, { fragRef });
		const text = Array.from(r.find('#parent').childNodes).find(
			(node) => node.nodeType === Node.TEXT_NODE,
		)!;
		expect(fragRef.current!.compareDocumentPosition(text)).toBe(
			Node.DOCUMENT_POSITION_CONTAINED_BY,
		);
		r.unmount();
	});

	it('reports that ancestors precede and contain a nonempty fragment', () => {
		const fragRef = makeRef();
		const r = mount(SurroundedFragment, { fragRef });
		const expected = Node.DOCUMENT_POSITION_PRECEDING | Node.DOCUMENT_POSITION_CONTAINS;
		expect(fragRef.current!.compareDocumentPosition(r.find('#parent'))).toBe(expected);
		expect(fragRef.current!.compareDocumentPosition(document.body)).toBe(expected);
		r.unmount();
	});

	// Per ReactDOMFragmentRefs-test.js: "handles empty fragment instances".
	it('marks empty-fragment sibling positions as implementation-specific', () => {
		const fragRef = makeRef();
		const r = mount(EmptySurroundedFragment, { fragRef });
		expect(fragRef.current!.compareDocumentPosition(r.find('#before'))).toBe(
			Node.DOCUMENT_POSITION_PRECEDING | Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC,
		);
		expect(fragRef.current!.compareDocumentPosition(r.find('#after'))).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC,
		);
		r.unmount();
	});

	it('reports exact parent and ancestor flags for empty fragments', () => {
		const fragRef = makeRef();
		const r = mount(EmptySurroundedFragment, { fragRef });
		expect(fragRef.current!.compareDocumentPosition(r.find('#parent'))).toBe(
			Node.DOCUMENT_POSITION_CONTAINS | Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC,
		);
		expect(fragRef.current!.compareDocumentPosition(document.body)).toBe(
			Node.DOCUMENT_POSITION_PRECEDING |
				Node.DOCUMENT_POSITION_CONTAINS |
				Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC,
		);
		r.unmount();
	});

	it('returns DISCONNECTED for a node in a different tree', () => {
		const fragRef = makeRef();
		const r = mount(SurroundedFragment, { fragRef });
		const detached = document.createElement('div');
		const flags = fragRef.current!.compareDocumentPosition(detached);
		expect(flags & Node.DOCUMENT_POSITION_DISCONNECTED).toBeTruthy();
		r.unmount();
	});

	// Per ReactDOMFragmentRefs-test.js: "handles portaled elements".
	it('marks logically owned portaled children as implementation-specific', () => {
		const target = document.createElement('section');
		document.body.appendChild(target);
		const fragRef = makeRef();
		const r = mount(FragmentPortalChildren, { fragRef, target });
		try {
			const owned = target.querySelector('#owned-portal')!;
			const outside = target.querySelector('#unowned-portal')!;
			expect(fragRef.current!.compareDocumentPosition(owned)).toBe(
				Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC,
			);
			expect(
				fragRef.current!.compareDocumentPosition(outside) & Node.DOCUMENT_POSITION_PRECEDING,
			).toBeTruthy();
		} finally {
			r.unmount();
			target.remove();
		}
	});
});

describe('FragmentInstance.dispatchEvent', () => {
	it('dispatches on the parent host element and bubbles to its listeners', () => {
		const fragRef = makeRef();
		const r = mount(ParentWithFragmentChild, { fragRef });
		const parent = r.find('#parent') as HTMLElement;
		let fired = 0;
		const handler = (e: Event) => {
			fired++;
			expect(e.type).toBe('customping');
		};
		parent.addEventListener('customping', handler);
		const result = fragRef.current!.dispatchEvent(new Event('customping', { bubbles: true }));
		expect(fired).toBe(1);
		expect(result).toBe(true);
		parent.removeEventListener('customping', handler);
		r.unmount();
	});

	it('returns false when a listener calls preventDefault on a cancellable event', () => {
		const fragRef = makeRef();
		const r = mount(ParentWithFragmentChild, { fragRef });
		const parent = r.find('#parent') as HTMLElement;
		const handler = (e: Event) => e.preventDefault();
		parent.addEventListener('customping', handler);
		const result = fragRef.current!.dispatchEvent(
			new Event('customping', { bubbles: true, cancelable: true }),
		);
		expect(result).toBe(false);
		parent.removeEventListener('customping', handler);
		r.unmount();
	});

	// Per ReactDOMFragmentRefs-test.js: "fires events on self, and only self if bubbles=false".
	it('delivers non-bubbling events only to listeners attached to the fragment', () => {
		const fragRef = makeRef();
		const r = mount(ParentWithFragmentChild, { fragRef });
		const parent = r.find('#parent') as HTMLElement;
		const events: string[] = [];
		parent.addEventListener('customping', () => events.push('parent'));
		fragRef.current!.addEventListener('customping', () => events.push('fragment'));
		const before = parent.innerHTML;
		expect(fragRef.current!.dispatchEvent(new Event('customping'))).toBe(true);
		expect(events).toEqual(['fragment']);
		expect(parent.innerHTML).toBe(before);
		r.unmount();
	});

	it('delivers bubbling events to the fragment before their host parent', () => {
		const fragRef = makeRef();
		const r = mount(ParentWithFragmentChild, { fragRef });
		const parent = r.find('#parent') as HTMLElement;
		const events: string[] = [];
		parent.addEventListener('customping', () => events.push('parent'));
		fragRef.current!.addEventListener('customping', () => events.push('fragment'));
		fragRef.current!.dispatchEvent(new Event('customping', { bubbles: true }));
		expect(events).toEqual(['fragment', 'parent']);
		r.unmount();
	});

	it('does not deliver non-bubbling events to host parents when no fragment listener exists', () => {
		const fragRef = makeRef();
		const r = mount(ParentWithFragmentChild, { fragRef });
		const parent = r.find('#parent') as HTMLElement;
		let fired = false;
		parent.addEventListener('customping', () => {
			fired = true;
		});
		expect(fragRef.current!.dispatchEvent(new Event('customping'))).toBe(true);
		expect(fired).toBe(false);
		r.unmount();
	});

	it('returns false when a fragment-local listener prevents a cancelable event', () => {
		const fragRef = makeRef();
		const r = mount(ParentWithFragmentChild, { fragRef });
		fragRef.current!.addEventListener('customping', (event) => event.preventDefault());
		expect(fragRef.current!.dispatchEvent(new Event('customping', { cancelable: true }))).toBe(
			false,
		);
		r.unmount();
	});
});
