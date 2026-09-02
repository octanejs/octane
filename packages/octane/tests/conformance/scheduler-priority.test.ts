// React-parity scheduler invariants — locked down so we cannot regress.
//
// (1) Discrete-event commit boundary: React's `batchedUpdates`
//     (react-dom-bindings/src/events/ReactDOMUpdateBatching.js) flushes sync
//     work at the end of the outermost event handler only when a controlled
//     form control has a pending state restore. Every other discrete update
//     (a click's setState, say) lands in the sync-lane microtask, so the
//     script that dispatched the event — and native listeners further along
//     the path — observe the pre-commit DOM until that script yields. Octane
//     follows the same policy; tests/discrete-dispatch-commit-timing.test.ts
//     runs the identical scenarios through react-dom as the oracle.
//
// (2) Effect mount order: useLayoutEffect / useEffect setups fire
//     child-first (post-order). Parent setups depend on child setups
//     having run — react-aria FocusScope, react-redux subscribers,
//     react-spring measurements all rely on this.
import { describe, it, expect, beforeEach } from 'vitest';
import { act, mount } from '../_helpers';
import {
	ClickCounter,
	FastClick,
	snapshots,
	resetSnapshots,
	Outer,
	layoutOrder,
	passiveOrder,
	resetEffectOrder,
	SiblingParent,
	siblingOrder,
	resetSiblingOrder,
	CleanupProbe,
	cleanupOrder,
	resetCleanupOrder,
} from './_fixtures/scheduler-priority.tsrx';

describe('Scheduler — discrete event commit boundary (React batchedUpdates)', () => {
	it('a click handler setState commits once the dispatching script yields', async () => {
		const r = mount(ClickCounter);
		const btn = r.find('#b') as HTMLButtonElement;
		expect(btn.textContent).toBe('0');
		// Native dispatchEvent from script — no controlled restore is pending, so
		// the commit lands in the microtask exactly as React's does.
		btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(btn.textContent).toBe('0');
		await act(async () => {});
		expect(btn.textContent).toBe('1');
		r.unmount();
	});

	it('handlers of back-to-back script dispatches all read the pre-commit DOM', async () => {
		resetSnapshots();
		const r = mount(FastClick);
		const btn = r.find('#fc') as HTMLButtonElement;
		// Within a SINGLE handler, setState is still queued — the DOM read in
		// that same handler sees the pre-commit value. Dispatches issued by the
		// same script share that window: nothing commits until the script yields
		// (React batches the same way), so every handler snapshots '0'.
		btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(snapshots).toEqual(['0', '0', '0']);
		expect(btn.textContent).toBe('0');
		// The updates read stale closure state (`setN(n + 1)` with n === 0), so
		// they collapse to a single increment — the same result React produces.
		await act(async () => {});
		expect(btn.textContent).toBe('1');
		r.unmount();
	});

	it('between events separated by a yield, each handler observes the committed value', async () => {
		resetSnapshots();
		const r = mount(FastClick);
		const btn = r.find('#fc') as HTMLButtonElement;
		for (const expected of ['0', '1', '2']) {
			btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(snapshots[snapshots.length - 1]).toBe(expected);
			await act(async () => {});
		}
		expect(btn.textContent).toBe('3');
		r.unmount();
	});

	it('act() wraps a discrete dispatch into a synchronous commit', () => {
		const r = mount(ClickCounter);
		const btn = r.find('#b') as HTMLButtonElement;
		expect(btn.textContent).toBe('0');
		void act(() => {
			btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		});
		expect(btn.textContent).toBe('1');
		void act(() => {
			btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		});
		expect(btn.textContent).toBe('2');
		r.unmount();
	});
});

describe('Scheduler — effect mount order is child-first (React post-order commit)', () => {
	beforeEach(() => {
		resetEffectOrder();
		resetSiblingOrder();
		resetCleanupOrder();
	});

	it('useLayoutEffect setup fires child-first across three nested levels', () => {
		const r = mount(Outer);
		// Layout-effect order must be deepest-first (Inner) → middle → outer.
		expect(layoutOrder).toEqual(['inner-layout', 'middle-layout', 'outer-layout']);
		r.unmount();
	});

	it('useEffect (passive) setup also fires child-first', async () => {
		const r = mount(Outer);
		// Flush passive effects deterministically — they're scheduled via
		// rAF → MessageChannel.postMessage; wait one rAF + one task.
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => setTimeout(() => resolve(), 0));
		});
		expect(passiveOrder).toEqual(['inner-passive', 'middle-passive', 'outer-passive']);
		r.unmount();
	});

	it('siblings fire in source order; parent fires LAST', () => {
		const r = mount(SiblingParent);
		// Same-depth siblings keep source order (Array.sort is stable);
		// parent (shallowest depth) fires last.
		expect(siblingOrder).toEqual(['A', 'B', 'parent']);
		r.unmount();
	});

	it('cleanup on unmount fires parent-first (React deletion order)', () => {
		const r = mount(CleanupProbe);
		// unmountScope fires a scope's own cleanups BEFORE recursing into its
		// children, so deletion cleanups run parent → child ("outer" before
		// "inner") — matching React's commitDeletionEffects pre-order walk
		// (ReactEffectOrdering-test.js:37/:64). This is the REVERSE of mount,
		// which fires child-first.
		r.unmount();
		expect(cleanupOrder).toEqual(['outer', 'inner']);
	});
});
