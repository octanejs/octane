// Port of react-dom/src/__tests__/ReactTreeTraversal-test.js (React 19.2.7).
//
// Two halves:
//
//  • 'Two phase traversal' — click capture root→target then bubble target→root
//    across component boundaries. Direct port; octane's delegated dispatch walks
//    the same paths.
//
//  • 'Enter leave traversal' — React SYNTHESIZES mouseenter/mouseleave sequences
//    from a single mouseout/mouseover + relatedTarget pair, walking from `from`
//    up to (excl.) the common ancestor (leaves, innermost-first) then from the
//    common ancestor (excl.) down to `to` (enters, outermost-first). That
//    synthesis exists only because React's root delegation can't hear the
//    non-bubbling native enter/leave events — an INTENTIONAL octane divergence
//    (docs/react-parity-migration-plan.md §2, synthetic event internals): octane
//    listens for the platform's REAL per-element enter/leave events
//    (runtime.ts TARGET_ONLY_DELEGATED), and the UA itself computes the same
//    common-ancestor paths. jsdom does not derive enter/leave from over/out, so
//    each case below dispatches the exact per-element sequence the UA would fire
//    for that pointer move and asserts octane reproduces React's logged order —
//    the OUTCOME the React test pins, without the synthesis mechanism.
//    tests/enter-leave-events.test.ts pins the target-only delivery basics; this
//    file adds the common-ancestor path shapes.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, createLog } from '../_helpers';
import { TraversalTree } from './_fixtures/enter-leave-traversal.tsrx';

// The React file's tree (same ids):  P > P_P1 > {P_P1_C1__DIV > __DIV_1/__DIV_2,
// P_P1_C2__DIV > …} and P > P_OneOff, plus two outer nodes outside the root.

const outsiders: HTMLElement[] = [];
function outsideNode(): HTMLElement {
	const el = document.createElement('div');
	document.body.appendChild(el);
	outsiders.push(el);
	return el;
}
afterEach(() => {
	while (outsiders.length) outsiders.pop()!.remove();
});

function setup() {
	const log = createLog();
	const r = mount(TraversalTree as any, { handler: log.push });
	const byId = (id: string) => {
		const el = r.container.querySelector('#' + id);
		if (!el) throw new Error('missing #' + id);
		return el as HTMLElement;
	};
	return { log, r, byId };
}

/** Dispatch the real, non-bubbling enter/leave events the UA would fire, in UA order. */
function uaFires(
	byId: (id: string) => HTMLElement,
	type: 'mouseenter' | 'mouseleave',
	ids: string[],
) {
	for (const id of ids) {
		byId(id).dispatchEvent(new MouseEvent(type, { bubbles: false, cancelable: false }));
	}
}

describe('Two phase traversal', () => {
	// Per ReactTreeTraversal-test.js:103 — 'should not traverse when target is
	// outside component boundary'. Octane's delegation listeners live on the root
	// container; a click on an unrelated node never reaches them.
	it('does not traverse when target is outside component boundary', () => {
		const { log, r } = setup();
		outsideNode().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		expect(log.drain()).toEqual([]);
		r.unmount();
	});

	// Per ReactTreeTraversal-test.js:111 — 'should traverse two phase across
	// component boundary'.
	it('traverses two phase across component boundary', () => {
		const { log, r, byId } = setup();
		byId('P_P1_C1__DIV_1').dispatchEvent(
			new MouseEvent('click', { bubbles: true, cancelable: true }),
		);
		expect(log.drain()).toEqual([
			'P captured click',
			'P_P1 captured click',
			'P_P1_C1__DIV captured click',
			'P_P1_C1__DIV_1 captured click',
			'P_P1_C1__DIV_1 bubbled click',
			'P_P1_C1__DIV bubbled click',
			'P_P1 bubbled click',
			'P bubbled click',
		]);
		r.unmount();
	});

	// Per ReactTreeTraversal-test.js:132 — 'should traverse two phase at
	// shallowest node'.
	it('traverses two phase at shallowest node', () => {
		const { log, r, byId } = setup();
		byId('P').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		expect(log.drain()).toEqual(['P captured click', 'P bubbled click']);
		r.unmount();
	});
});

describe('Enter leave traversal — UA-native adaptation (see header)', () => {
	// Per ReactTreeTraversal-test.js:147 — 'should not traverse when
	// enter/leaving outside DOM'. A move between two unrelated nodes makes the UA
	// fire enter/leave only on THOSE nodes; nothing in the octane tree hears
	// anything. (Also asserts the React synthesis input — mouseout with a
	// relatedTarget — triggers nothing, since octane doesn't synthesize.)
	it('does not traverse when enter/leaving outside DOM', () => {
		const { log, r } = setup();
		const a = outsideNode();
		const b = outsideNode();
		a.dispatchEvent(
			new MouseEvent('mouseout', { bubbles: true, cancelable: true, relatedTarget: b }),
		);
		// The UA-native equivalent: leave on a, enter on b — both outside the tree.
		a.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
		b.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
		expect(log.drain()).toEqual([]);
		r.unmount();
	});

	// Per ReactTreeTraversal-test.js:159 — 'should not traverse if enter/leave
	// the same node'. from === to: the UA fires NO enter/leave events at all, and
	// octane's handlers stay silent (the over/out pair alone triggers nothing).
	it('does not traverse if enter/leave the same node', () => {
		const { log, r, byId } = setup();
		const node = byId('P_P1_C1__DIV_1');
		node.dispatchEvent(
			new MouseEvent('mouseout', { bubbles: true, cancelable: true, relatedTarget: node }),
		);
		expect(log.drain()).toEqual([]);
		r.unmount();
	});

	// Per ReactTreeTraversal-test.js:174 — 'should traverse enter/leave to
	// sibling - avoids parent'. Moving DIV_1 → DIV_2: the common ancestor
	// (their parent) is neither left nor entered, so the UA fires exactly one
	// leave and one enter — leave first.
	it('traverses enter/leave to sibling — avoids parent', () => {
		const { log, r, byId } = setup();
		uaFires(byId, 'mouseleave', ['P_P1_C1__DIV_1']);
		uaFires(byId, 'mouseenter', ['P_P1_C1__DIV_2']);
		expect(log.drain()).toEqual(['P_P1_C1__DIV_1 mouseleave', 'P_P1_C1__DIV_2 mouseenter']);
		r.unmount();
	});

	// Per ReactTreeTraversal-test.js:195 — 'should traverse enter/leave to
	// parent - avoids parent'. Moving DIV_1 → its parent: only DIV_1 is left; the
	// parent was never exited so it gets no enter.
	it('traverses enter/leave to parent — avoids parent', () => {
		const { log, r, byId } = setup();
		uaFires(byId, 'mouseleave', ['P_P1_C1__DIV_1']);
		expect(log.drain()).toEqual(['P_P1_C1__DIV_1 mouseleave']);
		r.unmount();
	});

	// Per ReactTreeTraversal-test.js:215 — 'should enter from the window'.
	// Entering P_P1_C1__DIV from outside the tree: the UA fires mouseenter on
	// every newly-entered ancestor, outermost first — exactly React's logged order.
	it('enters from the window', () => {
		const { log, r, byId } = setup();
		uaFires(byId, 'mouseenter', ['P', 'P_P1', 'P_P1_C1__DIV']);
		expect(log.drain()).toEqual(['P mouseenter', 'P_P1 mouseenter', 'P_P1_C1__DIV mouseenter']);
		r.unmount();
	});

	// Per ReactTreeTraversal-test.js:235 — 'should enter from the window to the
	// shallowest'.
	it('enters from the window to the shallowest', () => {
		const { log, r, byId } = setup();
		uaFires(byId, 'mouseenter', ['P']);
		expect(log.drain()).toEqual(['P mouseenter']);
		r.unmount();
	});

	// Per ReactTreeTraversal-test.js:251 — 'should leave to the window'. Leaving
	// P_P1_C1__DIV for outside the tree: mouseleave on every exited element,
	// innermost first — React's logged order.
	it('leaves to the window', () => {
		const { log, r, byId } = setup();
		uaFires(byId, 'mouseleave', ['P_P1_C1__DIV', 'P_P1', 'P']);
		expect(log.drain()).toEqual(['P_P1_C1__DIV mouseleave', 'P_P1 mouseleave', 'P mouseleave']);
		r.unmount();
	});

	// Per ReactTreeTraversal-test.js:271 — 'should leave to the window from the
	// shallowest'.
	it('leaves to the window from the shallowest', () => {
		const { log, r, byId } = setup();
		uaFires(byId, 'mouseleave', ['P']);
		expect(log.drain()).toEqual(['P mouseleave']);
		r.unmount();
	});

	// Ancestors receive their OWN events only — a descendant's enter never fires
	// an ancestor handler through delegation (runtime.ts TARGET_ONLY_DELEGATED;
	// the UA sends each entered element its own event, so an ancestor walk would
	// double-fire). Guards the per-element contract all the sequence tests above
	// rely on.
	it('delivers each enter/leave to its target only', () => {
		const { log, r, byId } = setup();
		uaFires(byId, 'mouseenter', ['P_P1_C1__DIV_1']);
		expect(log.drain()).toEqual(['P_P1_C1__DIV_1 mouseenter']);
		r.unmount();
	});
});
