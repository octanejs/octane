import { describe, it, expect } from 'vitest';
import { mount } from '../_helpers';
import { FragmentInstance } from '../../src/index.js';
import {
	FutureChildren,
	FragmentRefUpdate,
	FragmentPortalChildren,
	NestedFragmentPortals,
	RootFragmentPortals,
	ConditionalFragmentPortal,
	ComponentFragmentPortal,
	InterleavedFragmentPortals,
	AbortedFragmentOwnership,
} from './_fixtures/fragment-future.tsrx';
import { NestedFragments } from './_fixtures/fragment-refs-misc.tsrx';

type FragmentHostElement = Element & { reactFragments?: Set<FragmentInstance> };

// React canary enableFragmentRefs: listeners/observers added to a FragmentInstance
// apply to children that mount LATER, and are detached from children that unmount.
describe('FragmentInstance — future children', () => {
	it('a listener added before a child existed still fires on that child once it mounts', () => {
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(FutureChildren, { fragRef });
		const fi = fragRef.current!;
		let count = 0;
		fi.addEventListener('click', () => count++);

		// #a was present when the listener was added.
		r.find('#a').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(count).toBe(1);
		expect(r.findAll('#b')).toHaveLength(0);

		// Mount #b into the live fragment — it must pick up the existing listener.
		r.click('#toggle');
		expect(r.findAll('#b')).toHaveLength(1);
		r.find('#b').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(count).toBe(2);

		r.unmount();
	});

	// Per ReactDOMFragmentRefs-test.js:118.
	it('publishes fragment handles for existing, added, and removed children', () => {
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(FutureChildren, { fragRef });
		const fragment = fragRef.current!;
		const first = r.find('#a') as FragmentHostElement;
		expect(first.reactFragments?.has(fragment)).toBe(true);

		r.click('#toggle');
		const added = r.find('#b') as FragmentHostElement;
		expect(added.reactFragments?.has(fragment)).toBe(true);

		r.click('#toggle');
		expect(r.findAll('#b')).toHaveLength(0);
		expect(added.reactFragments).toBeInstanceOf(Set);
		expect(added.reactFragments?.has(fragment)).toBe(false);
		expect(first.reactFragments?.has(fragment)).toBe(true);

		r.unmount();
		expect(first.reactFragments?.has(fragment)).toBe(false);
	});

	// Per ReactDOMFragmentRefs-test.js:118.
	it('records both fragment handles on children shared by nested fragments', () => {
		const outerRef: { current: FragmentInstance | null } = { current: null };
		const innerRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(NestedFragments, { outerRef, innerRef });
		const outerOnly = r.find('#outer-a') as FragmentHostElement;
		const shared = r.find('#inner-a') as FragmentHostElement;

		expect(outerOnly.reactFragments?.has(outerRef.current!)).toBe(true);
		expect(outerOnly.reactFragments?.has(innerRef.current!)).toBe(false);
		expect(shared.reactFragments?.has(outerRef.current!)).toBe(true);
		expect(shared.reactFragments?.has(innerRef.current!)).toBe(true);

		const outer = outerRef.current!;
		const inner = innerRef.current!;
		r.unmount();
		expect(shared.reactFragments?.has(outer)).toBe(false);
		expect(shared.reactFragments?.has(inner)).toBe(false);
	});

	// Per ReactDOMFragmentRefs-test.js:118.
	it('publishes existing child handles before invoking the fragment callback ref', () => {
		let attachedToChild = false;
		const fragRef = (fragment: FragmentInstance | null) => {
			if (fragment === null) return;
			const first = document.querySelector('#a') as FragmentHostElement;
			attachedToChild = first.reactFragments?.has(fragment) === true;
		};
		const r = mount(FutureChildren, { fragRef });
		expect(attachedToChild).toBe(true);
		r.unmount();
	});

	it('removes eager DOM fragment handles when a later sibling aborts the render', () => {
		const captured: FragmentHostElement[] = [];
		const attached: FragmentInstance[] = [];
		const r = mount(AbortedFragmentOwnership, {
			fragRef: (fragment: FragmentInstance | null) => {
				if (fragment !== null) attached.push(fragment);
			},
			capture: (node: Element) => captured.push(node as FragmentHostElement),
		});
		expect(r.find('#aborted-fragment-fallback').textContent).toBe('fallback');
		expect(attached).toEqual([]);
		expect(captured).toHaveLength(1);
		expect(captured[0].reactFragments).toBeInstanceOf(Set);
		expect(Array.from(captured[0].reactFragments!)).toEqual([]);
		r.unmount();
	});

	// Per ReactDOMFragmentRefs-test.js:867.
	it('detaches fragment listeners from children removed while the fragment remains mounted', () => {
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(FutureChildren, { fragRef });
		let fired = 0;
		fragRef.current!.addEventListener('click', () => fired++);
		r.click('#toggle');
		const removed = r.find('#b');
		removed.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(fired).toBe(1);

		r.click('#toggle');
		removed.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(fired).toBe(1);
		r.unmount();
	});

	// Per ReactDOMFragmentRefs-test.js:867.
	it('does not revive an exhausted once listener when another child mounts', () => {
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(FutureChildren, { fragRef });
		let fired = 0;
		fragRef.current!.addEventListener('click', () => fired++, { once: true });
		r.find('#a').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(fired).toBe(1);

		r.click('#toggle');
		r.find('#a').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(fired).toBe(1);
		r.find('#b').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		r.find('#b').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(fired).toBe(2);
		r.unmount();
	});

	it('removeEventListener stops future children from getting the listener', () => {
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(FutureChildren, { fragRef });
		const fi = fragRef.current!;
		let count = 0;
		const handler = () => count++;
		fi.addEventListener('click', handler);
		fi.removeEventListener('click', handler);

		r.click('#toggle'); // add #b after removal
		r.find('#b').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(count).toBe(0);
		r.unmount();
	});

	it('an observer added before a child existed observes it once it mounts', () => {
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const observed: Element[] = [];
		const observer = { observe: (el: Element) => observed.push(el), unobserve: () => {} };
		const r = mount(FutureChildren, { fragRef });
		const fi = fragRef.current!;
		fi.observeUsing(observer);
		expect(observed).toContain(r.find('#a'));

		r.click('#toggle'); // add #b
		const b = r.find('#b');
		expect(observed).toContain(b);
		r.unmount();
	});

	// Per ReactDOMFragmentRefs-test.js:1194.
	it('observes each retained or added child only when it first joins the fragment', () => {
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const observed: Element[] = [];
		const unobserved: Element[] = [];
		const observer = {
			observe: (element: Element) => observed.push(element),
			unobserve: (element: Element) => unobserved.push(element),
		};
		const r = mount(FutureChildren, { fragRef });
		const first = r.find('#a');
		fragRef.current!.observeUsing(observer);
		expect(observed).toEqual([first]);

		r.click('#toggle');
		const added = r.find('#b');
		expect(observed).toEqual([first, added]);

		r.update(FutureChildren, { fragRef });
		expect(observed).toEqual([first, added]);

		r.click('#toggle');
		expect(observed).toEqual([first, added]);
		expect(unobserved).toEqual([]);
		r.unmount();
		expect(unobserved).toEqual([]);
	});
});

describe('FragmentInstance — portaled children', () => {
	// Per ReactDOMFragmentRefs-test.js:924 and :1287.
	it('includes only logically owned portal children in handles, listeners, and observers', () => {
		const target = document.createElement('section');
		document.body.appendChild(target);
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(FragmentPortalChildren, { fragRef, target });
		try {
			const fragment = fragRef.current!;
			const owned = target.querySelector('#owned-portal') as FragmentHostElement;
			const outside = target.querySelector('#unowned-portal') as FragmentHostElement;
			expect(owned.reactFragments?.has(fragment)).toBe(true);
			expect(outside.reactFragments?.has(fragment)).not.toBe(true);

			const observed: Element[] = [];
			const observer = { observe: (element: Element) => observed.push(element), unobserve() {} };
			fragment.observeUsing(observer);
			expect(observed.map((element) => element.id)).toEqual([
				'inline-before',
				'owned-portal',
				'inline-after',
			]);

			const clicked: string[] = [];
			fragment.addEventListener('click', (event) => clicked.push((event.target as Element).id));
			outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			owned.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			r.find('#inline-after').dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(clicked).toEqual(['owned-portal', 'inline-after']);
		} finally {
			r.unmount();
			target.remove();
		}
	});

	// Per ReactDOMFragmentRefs-test.js:118 and :1287.
	it('gives nested fragment owners the same portaled child without leaking to siblings', () => {
		const target = document.createElement('section');
		document.body.appendChild(target);
		const outerRef: { current: FragmentInstance | null } = { current: null };
		const innerRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(NestedFragmentPortals, { outerRef, innerRef, target });
		try {
			const outer = outerRef.current!;
			const inner = innerRef.current!;
			const shared = target.querySelector('#shared-portal') as FragmentHostElement;
			const outerOnly = target.querySelector('#outer-portal') as FragmentHostElement;
			expect(shared.reactFragments?.has(outer)).toBe(true);
			expect(shared.reactFragments?.has(inner)).toBe(true);
			expect(outerOnly.reactFragments?.has(outer)).toBe(true);
			expect(outerOnly.reactFragments?.has(inner)).toBe(false);

			const observed: string[] = [];
			outer.observeUsing({ observe: (element) => observed.push(element.id), unobserve() {} });
			expect(observed).toEqual(['outer-inline', 'shared-portal', 'inner-inline', 'outer-portal']);

			const nestedClicks: string[] = [];
			inner.addEventListener('click', (event) => nestedClicks.push((event.target as Element).id));
			outerOnly.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			shared.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(nestedClicks).toEqual(['shared-portal']);
		} finally {
			r.unmount();
			target.remove();
		}
	});

	it('moves fragment registrations when a logically owned portal changes target', () => {
		const firstTarget = document.createElement('section');
		const secondTarget = document.createElement('section');
		document.body.append(firstTarget, secondTarget);
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(FragmentPortalChildren, { fragRef, target: firstTarget });
		try {
			const fragment = fragRef.current!;
			const removed = firstTarget.querySelector('#owned-portal') as FragmentHostElement;
			const clicked: Element[] = [];
			fragment.addEventListener('click', (event) => clicked.push(event.target as Element));

			r.update(FragmentPortalChildren, { fragRef, target: secondTarget });
			const replacement = secondTarget.querySelector('#owned-portal') as FragmentHostElement;
			expect(firstTarget.querySelector('#owned-portal')).toBeNull();
			expect(removed.reactFragments?.has(fragment)).toBe(false);
			expect(replacement.reactFragments?.has(fragment)).toBe(true);
			removed.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			replacement.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(clicked).toEqual([replacement]);
		} finally {
			r.unmount();
			firstTarget.remove();
			secondTarget.remove();
		}
	});

	it('keeps portal ownership and authored order when the Fragment is the component root', () => {
		const target = document.createElement('section');
		document.body.appendChild(target);
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(RootFragmentPortals, { fragRef, target });
		try {
			const fragment = fragRef.current!;
			const before = target.querySelector('#root-portal-before') as FragmentHostElement;
			const after = target.querySelector('#root-portal-after') as FragmentHostElement;
			expect(before.reactFragments?.has(fragment)).toBe(true);
			expect(after.reactFragments?.has(fragment)).toBe(true);

			const observed: string[] = [];
			fragment.observeUsing({ observe: (element) => observed.push(element.id), unobserve() {} });
			expect(observed).toEqual(['root-portal-before', 'root-inline', 'root-portal-after']);

			const clicked: string[] = [];
			fragment.addEventListener('click', (event) => clicked.push((event.target as Element).id));
			before.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			after.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(clicked).toEqual(['root-portal-before', 'root-portal-after']);
		} finally {
			r.unmount();
			target.remove();
		}
	});

	it('inherits and removes Fragment bindings when a conditional portal mounts and unmounts', () => {
		const target = document.createElement('section');
		document.body.appendChild(target);
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(ConditionalFragmentPortal, { fragRef, target });
		try {
			const fragment = fragRef.current!;
			const observed: Element[] = [];
			const clicked: string[] = [];
			fragment.observeUsing({ observe: (element) => observed.push(element), unobserve() {} });
			fragment.addEventListener('click', (event) => clicked.push((event.target as Element).id));
			expect(observed.map((element) => element.id)).toEqual([
				'conditional-before',
				'conditional-after',
			]);

			r.click('#conditional-toggle');
			const added = target.querySelector('#conditional-portal') as FragmentHostElement;
			expect(added.reactFragments?.has(fragment)).toBe(true);
			expect(observed).toContain(added);
			added.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(clicked).toEqual(['conditional-portal']);

			r.click('#conditional-toggle');
			expect(target.querySelector('#conditional-portal')).toBeNull();
			expect(added.reactFragments?.has(fragment)).toBe(false);
			added.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(clicked).toEqual(['conditional-portal']);

			r.click('#conditional-toggle');
			const replacement = target.querySelector('#conditional-portal') as FragmentHostElement;
			expect(replacement).not.toBe(added);
			expect(replacement.reactFragments?.has(fragment)).toBe(true);
			replacement.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(clicked).toEqual(['conditional-portal', 'conditional-portal']);
		} finally {
			r.unmount();
			target.remove();
		}
	});

	it('owns a portal returned through a nested child component', () => {
		const target = document.createElement('section');
		document.body.appendChild(target);
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(ComponentFragmentPortal, { fragRef, target });
		try {
			const fragment = fragRef.current!;
			const portaled = target.querySelector('#component-portal') as FragmentHostElement;
			expect(portaled.reactFragments?.has(fragment)).toBe(true);

			const observed: string[] = [];
			fragment.observeUsing({ observe: (element) => observed.push(element.id), unobserve() {} });
			expect(observed).toEqual(['component-before', 'component-portal', 'component-after']);

			let fired = 0;
			fragment.addEventListener('click', () => fired++);
			portaled.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(fired).toBe(1);
		} finally {
			r.unmount();
			target.remove();
		}
	});

	it('preserves an independent shared-target portal when its interleaved owner unmounts', () => {
		const target = document.createElement('section');
		document.body.appendChild(target);
		const fragRef: { current: FragmentInstance | null } = { current: null };
		let siblingClicks = 0;
		const props = {
			fragRef,
			target,
			showOwned: true,
			showSibling: true,
			showLate: false,
			onSiblingClick: () => siblingClicks++,
		};
		const r = mount(InterleavedFragmentPortals, props);
		try {
			const sibling = target.querySelector('#interleaved-independent')!;
			r.update(InterleavedFragmentPortals, { ...props, showLate: true });
			expect(Array.from(target.querySelectorAll('button')).map((node) => node.id)).toEqual([
				'interleaved-owned-first',
				'interleaved-independent',
				'interleaved-owned-late',
			]);

			r.update(InterleavedFragmentPortals, { ...props, showOwned: false });
			expect(fragRef.current).toBeNull();
			expect(target.querySelector('#interleaved-independent')).toBe(sibling);
			expect(target.querySelector('#interleaved-owned-first')).toBeNull();
			expect(target.querySelector('#interleaved-owned-late')).toBeNull();
			sibling.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(siblingClicks).toBe(1);
		} finally {
			r.unmount();
			expect(target.childNodes).toHaveLength(0);
			target.remove();
		}
	});

	it('removes an interleaved independent portal without disturbing its Fragment owner', () => {
		const target = document.createElement('section');
		document.body.appendChild(target);
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const props = {
			fragRef,
			target,
			showOwned: true,
			showSibling: true,
			showLate: false,
			onSiblingClick() {},
		};
		const r = mount(InterleavedFragmentPortals, props);
		try {
			const fragment = fragRef.current!;
			const first = target.querySelector('#interleaved-owned-first');
			r.update(InterleavedFragmentPortals, { ...props, showLate: true });
			const late = target.querySelector('#interleaved-owned-late');
			r.update(InterleavedFragmentPortals, {
				...props,
				showSibling: false,
				showLate: true,
			});
			expect(fragRef.current).toBe(fragment);
			expect(target.querySelector('#interleaved-owned-first')).toBe(first);
			expect(target.querySelector('#interleaved-owned-late')).toBe(late);
			expect(target.querySelector('#interleaved-independent')).toBeNull();
		} finally {
			r.unmount();
			expect(target.childNodes).toHaveLength(0);
			target.remove();
		}
	});

	it('keeps shared-target ordering and ownership across repeated late-child toggles', () => {
		const target = document.createElement('section');
		document.body.appendChild(target);
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const props = {
			fragRef,
			target,
			showOwned: true,
			showSibling: true,
			showLate: false,
			onSiblingClick() {},
		};
		const r = mount(InterleavedFragmentPortals, props);
		try {
			const fragment = fragRef.current!;
			for (let iteration = 0; iteration < 3; iteration++) {
				r.update(InterleavedFragmentPortals, { ...props, showLate: true });
				const late = target.querySelector('#interleaved-owned-late') as FragmentHostElement;
				expect(Array.from(target.querySelectorAll('button')).map((node) => node.id)).toEqual([
					'interleaved-owned-first',
					'interleaved-independent',
					'interleaved-owned-late',
				]);
				expect(late.reactFragments?.has(fragment)).toBe(true);
				r.update(InterleavedFragmentPortals, { ...props, showLate: false });
				expect(late.reactFragments?.has(fragment)).toBe(false);
				expect(Array.from(target.querySelectorAll('button')).map((node) => node.id)).toEqual([
					'interleaved-owned-first',
					'interleaved-independent',
				]);
			}
		} finally {
			r.unmount();
			expect(target.childNodes).toHaveLength(0);
			target.remove();
		}
	});
});

describe('FragmentInstance — changing ref expression (update path)', () => {
	it('detaches the old fragment ref and attaches the new one on a ref change', () => {
		const log: string[] = [];
		const a = (fi: any) => log.push(fi ? 'a:attach' : 'a:null');
		const b = (fi: any) => log.push(fi ? 'b:attach' : 'b:null');

		const r = mount(FragmentRefUpdate, { pick: a });
		expect(log).toEqual(['a:attach']);

		r.update(FragmentRefUpdate, { pick: b });
		expect(log).toEqual(['a:attach', 'a:null', 'b:attach']);

		r.unmount();
		expect(log).toEqual(['a:attach', 'a:null', 'b:attach', 'b:null']);
	});

	it('keeps one fragment instance while replacement callbacks clean up before reattachment', () => {
		const log: string[] = [];
		const fragments: FragmentInstance[] = [];
		const observe = (name: string) => (fragment: FragmentInstance | null) => {
			if (fragment !== null) {
				fragments.push(fragment);
				log.push(`${name}:attach`);
			}
			return () => log.push(`${name}:cleanup`);
		};
		const first = observe('first');
		const second = observe('second');
		const root = mount(FragmentRefUpdate, { pick: first });

		root.update(FragmentRefUpdate, { pick: first });
		expect(log).toEqual(['first:attach']);
		root.update(FragmentRefUpdate, { pick: second });
		expect(log).toEqual(['first:attach', 'first:cleanup', 'second:attach']);
		expect(fragments[1]).toBe(fragments[0]);

		root.update(FragmentRefUpdate, { pick: null });
		expect(log.at(-1)).toBe('second:cleanup');
		root.update(FragmentRefUpdate, { pick: first });
		expect(fragments[2]).toBe(fragments[0]);
		expect(log.at(-1)).toBe('first:attach');
		root.unmount();
		expect(log.at(-1)).toBe('first:cleanup');
	});
});
