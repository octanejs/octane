import { describe, it, expect } from 'vitest';
import { mount } from '../_helpers';
import { flushSync } from '../../src/index.js';
import {
	ArityObserver,
	StableRefAcrossRenderPhase,
	InputEventUpdate,
} from './_fixtures/hooks-arity.tsrx';

// Small-file Tier-1 closeouts: React-hooks-arity.js, useRef-test.internal.js
// (:107), and ReactDOMHooks-test.js (:157).

describe('conformance: hook function arity (React-hooks-arity.js)', () => {
	it("ensure useState setter's arity is correct", () => {
		// Per React-hooks-arity.js:23 — setState.length === 1.
		let setterLen = -1;
		const r = mount(ArityObserver, { observe: (s: number) => (setterLen = s) });
		expect(setterLen).toBe(1);
		r.unmount();
	});

	it("ensure useReducer setter's arity is correct", () => {
		// Per React-hooks-arity.js:34 — dispatch.length === 1.
		let dispatchLen = -1;
		const r = mount(ArityObserver, { observe: (_s: number, d: number) => (dispatchLen = d) });
		expect(dispatchLen).toBe(1);
		r.unmount();
	});
});

describe('conformance: useRef identity (useRef-test.internal.js)', () => {
	it('should return the same ref during re-renders', () => {
		// Per useRef-test.internal.js:107 — the fixture throws 'should never
		// change' if the ref identity ever differs from the first-seen one,
		// across a chain of render-phase setState updates and across a fresh
		// top-level render. (Plain re-render identity is also pinned in
		// tests/useref.test.ts and differential/refs-effects.test.ts.)
		const r = mount(StableRefAcrossRenderPhase);
		expect(r.find('#count').textContent).toBe('3');
		r.update(StableRefAcrossRenderPhase);
		expect(r.find('#count').textContent).toBe('3');
		r.unmount();
	});
});

describe('conformance: update from event handler (ReactDOMHooks-test.js)', () => {
	it('should not bail out when an update is scheduled from within an event handler in Concurrent Mode', () => {
		// Per ReactDOMHooks-test.js:157 — the setState inside the (native,
		// delegated) input handler must commit; the label shows the typed text.
		const r = mount(InputEventUpdate);
		const input = r.find('#in') as HTMLInputElement;
		input.value = 'abc';
		flushSync(() => {
			input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
		});
		expect(r.find('#label').innerHTML).toBe('abc');
		r.unmount();
	});
});

// ============================================================================
// Accounting:
//
// React-hooks-arity.js (2 tests):
//   :23 useState setter arity — PORTED (passes). (React's fixture calls
//        useReducer with no initial state; octane's compiler appends the hook
//        slot as the trailing argument, so the fixture passes an explicit
//        initial state — the arity assertion is unaffected.)
//   :34 useReducer dispatch arity — PORTED (passes).
//
// useRef-test.internal.js:
//   :48 "creates a ref object initialized with the provided value" —
//        COVERED-BY-EXISTING: tests/useref.test.ts (initial value + mutation
//        semantics).
//   :107 "should return the same ref during re-renders" — PORTED (passes;
//        adds the render-phase-update chain to the existing identity pins in
//        tests/useref.test.ts and tests/differential/refs-effects.test.ts).
//   :132/:158/:182/:201/:224 (__DEV__ block) — N/A: DEV-only warning policy
//        (ref read/write warnings, class refs); octane's warning policy
//        differs by design (plan §2).
//
// ReactDOMHooks-test.js (4 tests):
//   :39 "can ReactDOM.render() from useEffect" — N/A: legacy ReactDOM.render
//        multi-root API; octane is concurrent-root only. (The functional
//        cross-root cascade is out of this wave's Tier-1 scope.)
//   :80 "can render() from useEffect" — out of scope for this wave (multi-root
//        render-from-effect plumbing, not a hook heuristic); octane's
//        render-from-effect scheduling is exercised by tests/act.test.ts and
//        effect-cascade coverage in tests/effect-timing.test.ts.
//   :124 "should not bail out when an update is scheduled from within an event
//        handler" — N/A: `@gate !disableLegacyMode` (legacy-mode variant); the
//        set-then-revert observable is pinned in
//        conformance/derived-state.test.ts ('set-then-revert in one handler
//        still renders the body once', citing ReactDOMHooks-test.js).
//   :157 concurrent-mode variant — PORTED (passes).
// ============================================================================
