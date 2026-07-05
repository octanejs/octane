/**
 * Refs × error boundaries — ported from facebook/react
 * packages/react-dom/src/__tests__/ReactErrorBoundaries-test.internal.js
 * (:1158, :1209, :2782) and packages/react-reconciler/src/__tests__/
 * ReactFiberRefs-test.js (:64), React 19.2.7. OUTCOME ports per
 * docs/react-parity-migration-plan.md §3 Tier 7 (class ErrorBoundary →
 * @try/@catch; lifecycle-log assertions reduce to their observable ref /
 * DOM outcomes).
 */
import { describe, it, expect } from 'vitest';
import { mount } from '../_helpers';
import { AbortedMountRefs, DetachThrowApp, HostRefSwap } from './_fixtures/refs-under-error.tsrx';

describe('refs reset if mounting aborts', () => {
	// Per ReactErrorBoundaries-test.internal.js:1158 — 'resets callback refs
	// if mounting aborts'. The try body renders <div ref={childRef}/> then a
	// sibling that throws while mounting. The outcome React guarantees:
	// childRef never ends up holding a node from the aborted body (it is
	// never called with an element); the fallback's errorMessageRef attaches
	// to the fallback div and detaches to null on unmount.
	it('resets callback refs if mounting aborts', () => {
		const childCalls: (Element | null)[] = [];
		const errCalls: (Element | null)[] = [];
		const r = mount(AbortedMountRefs as any, {
			childRef: (el: Element | null) => {
				childCalls.push(el);
			},
			errorMessageRef: (el: Element | null) => {
				errCalls.push(el);
			},
		});

		expect(r.container.textContent).toBe('Caught an error: Hello.');
		// The aborted try body left nothing behind.
		expect(r.findAll('.child')).toHaveLength(0);
		// The aborted mount never handed childRef a live element.
		expect(childCalls.filter((c) => c !== null)).toEqual([]);
		// The committed fallback's ref attached exactly once.
		expect(errCalls).toHaveLength(1);
		expect(errCalls[0]).toBe(r.find('.error-message'));

		r.unmount();
		expect(errCalls).toHaveLength(2);
		expect(errCalls[1]).toBe(null);
	});

	// Per ReactErrorBoundaries-test.internal.js:1158 — the strict half: in
	// React, refs attach only in the commit phase, so a ref belonging to
	// work that ABORTED is never invoked AT ALL (the original's log has no
	// "Child ref is set to …" entry — not even a null one). octane matches:
	// unmountScope suppresses queued ref detaches while unwinding a scope whose
	// mount never COMPLETED (`mounted !== true`), so the boundary's unwind of
	// the aborted body can't fire ref(null) for a ref that never held a node.
	it("never invokes the aborted try body's callback ref, not even with null", () => {
		const childCalls: (Element | null)[] = [];
		const r = mount(AbortedMountRefs as any, {
			childRef: (el: Element | null) => {
				childCalls.push(el);
			},
			errorMessageRef: () => {},
		});
		const calls = childCalls.slice();
		r.unmount();

		expect(calls).toEqual([]);
	});

	// Per ReactErrorBoundaries-test.internal.js:1209 — 'resets object refs if
	// mounting aborts'. Same shape with object refs: childRef.current must
	// stay null throughout; errorMessageRef.current cycles div → null.
	it('resets object refs if mounting aborts', () => {
		const childRef: { current: Element | null } = { current: null };
		const errorMessageRef: { current: Element | null } = { current: null };
		const r = mount(AbortedMountRefs as any, { childRef, errorMessageRef });

		expect(r.container.textContent).toBe('Caught an error: Hello.');
		expect(childRef.current).toBe(null);
		expect(String(errorMessageRef.current)).toBe('[object HTMLDivElement]');
		expect(errorMessageRef.current).toBe(r.find('.error-message'));

		r.unmount();
		expect(errorMessageRef.current).toBe(null);
	});
});

describe('errors thrown while detaching refs', () => {
	// Per ReactErrorBoundaries-test.internal.js:2782 — 'catches errors thrown
	// while detaching refs'. Removing the inner-boundary subtree makes the
	// broken callback ref throw on its null detach. React's full contract, now
	// matched: the throw does NOT block the unmount (the detach fired with
	// null, the ref'd DOM is gone), does NOT escape the flush, and is routed —
	// skipping the unmounting inner boundary — to the nearest STILL-MOUNTED
	// boundary, whose fallback replaces the try body ("OuterFallback").
	// (drainRefDetaches guards each queued detach and routes throws to the
	// teardown boundary captured at queue time.)
	it('a throwing ref detach does not block the unmount and reaches the outer boundary', () => {
		const refCalls: (Element | null)[] = [];
		const brokenRef = (el: Element | null) => {
			refCalls.push(el);
			if (el === null) {
				throw new Error('Expected');
			}
		};

		const r = mount(DetachThrowApp as any, { keepInner: true, r: brokenRef });
		expect(r.find('.sibling').textContent).toBe('sibling');
		expect(r.find('.inner-ref').textContent).toBe('ref');
		expect(refCalls).toHaveLength(1);

		// The throw must not escape the flush (React catches it in the commit).
		expect(() => r.update(DetachThrowApp as any, { keepInner: false, r: brokenRef })).not.toThrow();

		// Detach fired (with null) exactly once…
		expect(refCalls).toHaveLength(2);
		expect(refCalls[1]).toBe(null);
		// …did not block the unmount — no trace of the removed subtree…
		expect(r.findAll('.inner-ref')).toHaveLength(0);
		// …and the nearest still-mounted boundary caught it (React behavior).
		expect(r.container.textContent).toBe('OuterFallback');

		r.unmount();
	});
});

describe('ref is attached even if there are no other updates', () => {
	// Per ReactFiberRefs-test.js:64 — 'ref is attached even if there are no
	// other updates (host component)'. The div's rendered output is byte-
	// identical across the update; only the ref binding's resolved object
	// flips. The old ref must be detached (null) and the new one attached to
	// the SAME dom node, with no remount.
	it('swaps host refs when nothing else about the element changed', () => {
		const ref1: { current: Element | null } = { current: null };
		const ref2: { current: Element | null } = { current: null };
		const r = mount(HostRefSwap as any, { which: 1, ref1, ref2 });

		const div = r.find('.host');
		expect(div.textContent).toBe('Hi');
		expect(ref1.current).toBe(div);
		expect(ref2.current).toBe(null);

		r.update(HostRefSwap as any, { which: 2, ref1, ref2 });
		expect(r.find('.host')).toBe(div); // same node — no remount
		expect(r.container.textContent).toBe('Hi');
		expect(ref1.current).toBe(null);
		expect(ref2.current).toBe(div);

		r.unmount();
		expect(ref2.current).toBe(null);
	});
});

/*
 * ── Accounting: ReactFiberRefs-test.js (5 its) ────────────────────────────
 *   :28  ref is attached even if there are no other updates (class) —
 *        SKIPPED: depends on class shouldComponentUpdate bailout semantics
 *        (ref swapped without a re-render). Octane (like React 19 function
 *        components) passes ref as a regular prop, so there is no "ref
 *        changed but props didn't" bailout to observe. The host-component
 *        half (:64) is ported above.
 *   :64  ref is attached even if there are no other updates (host) — PORTED.
 *   :90  throw if a string ref is passed — SKIPPED: string refs are a
 *        removed React feature; octane never had them.
 *   :113 string refs can be codemodded to callback refs — SKIPPED: class
 *        this.refs mechanics.
 *   :138 class refs are initialized to a frozen shared object — SKIPPED:
 *        class this.refs mechanics.
 *
 * ── Accounting: refs-test.js (12 its) ─────────────────────────────────────
 * Already ported (see conformance/refs.test.ts, which cites each line):
 *   :62 ref hopping, :121 stable stateless ref, :176/:225 root-level refs,
 *   :274/:314 cleanup-function refs, :346 stable-identity ref not re-run,
 *   :379 detach via cleanup vs null, :443 cleanup on unmount,
 *   :491/:506/:528 useImperativeHandle object/callback/cleanup.
 * Skipped there (reasons in that file's header):
 *   :105 this.refs (class), :150 invalid-ref error surface.
 */
