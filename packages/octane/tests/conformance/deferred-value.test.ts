import { describe, it, expect } from 'vitest';
import { mount, act, createLog } from '../_helpers';
import { flushSync, startTransition } from '../../src/index.js';
import {
	UnmemoizedObjectHost,
	RenderPhaseDeferredHost,
	InitialValueApp,
	TransitionMountGate,
	SuspenseInitialFinal,
	WaterfallApp,
	RemountPreviewApp,
	ActivityDeferredContainer,
	ActivityNoInitialContainer,
} from './_fixtures/deferred-value.tsrx';

// Ports of facebook/react ReactDeferredValue-test.js (React 19.2.7), adapted
// to octane's sync scheduler: React's per-paint `waitForPaint` checkpoints map
// to "after the synchronous flush" (urgent pass) and "after act()" (the spawned
// deferred pass — octane schedules it on a microtask at transition priority).
//
// Octane's useDeferredValue model (runtime.ts): a hook slot holds the last
// COMMITTED value. An urgent render with a changed value returns the previous
// committed value and queues a microtask that re-renders the block inside
// startTransition; a render that is ALREADY at transition priority commits the
// new value in the same pass. The (value, initialValue) overload returns
// initialValue on mount and spawns the same deferred swap.

/**
 * Test-side AsyncText cache: stable promise per key + request log. Mirrors the
 * React fixture's textCache, which reads SYNCHRONOUSLY once resolved — so a
 * resolved entry is status-tagged (`use()`'s fulfilled fast path) instead of
 * suspending for one microtask on first read.
 */
function makeTextCache(log: (s: string) => void) {
	interface Entry {
		promise: Promise<string> & { status?: string; value?: string };
		resolve: (v: string) => void;
	}
	const cache = new Map<string, Entry>();
	const getText = (text: string): Promise<string> => {
		let entry = cache.get(text);
		if (!entry) {
			log(`Async text requested [${text}]`);
			let resolve!: (v: string) => void;
			const promise: Entry['promise'] = new Promise<string>((res) => {
				resolve = res;
			});
			entry = { promise, resolve };
			cache.set(text, entry);
		}
		return entry.promise;
	};
	const resolveText = (text: string): void => {
		// Touch the cache first so a never-requested key still resolves cleanly.
		getText(text);
		const entry = cache.get(text)!;
		entry.resolve(text);
		entry.promise.status = 'fulfilled';
		entry.promise.value = text;
	};
	return { getText, resolveText };
}

describe('conformance: useDeferredValue (ReactDeferredValue-test.js)', () => {
	it("does not cause an infinite defer loop if the original value isn't memoized", async () => {
		// Per ReactDeferredValue-test.js:108 — "does not cause an infinite defer
		// loop if the original value isn't memoized". The object passed to
		// useDeferredValue is never the same as the previous render's; the
		// deferred pass must still settle. (act() throws on a non-converging
		// scheduler, so completing at all IS the no-infinite-loop assertion.)
		const log = createLog();
		let setValue!: (v: number) => void;
		const r = mount(UnmemoizedObjectHost, { expose: (s: any) => (setValue = s), log: log.push });
		await act(() => {});
		expect(r.find('#original').textContent).toBe('Original: 1');
		expect(r.find('#deferred').textContent).toBe('Deferred: 1');
		log.clear();

		// Urgent update: the value is deferred — old value visible for one pass.
		flushSync(() => setValue(2));
		expect(r.find('#original').textContent).toBe('Original: 2');
		expect(r.find('#deferred').textContent).toBe('Deferred: 1');
		// The deferred value updates in a separate (settling) render.
		await act(() => {});
		expect(r.find('#original').textContent).toBe('Original: 2');
		expect(r.find('#deferred').textContent).toBe('Deferred: 2');

		// But if it updates during a transition, it doesn't defer: the deferred
		// value updates in the same render as the original.
		flushSync(() => startTransition(() => setValue(3)));
		expect(r.find('#original').textContent).toBe('Original: 3');
		expect(r.find('#deferred').textContent).toBe('Deferred: 3');
		await act(() => {});
		expect(r.find('#deferred').textContent).toBe('Deferred: 3');
		r.unmount();
	});

	it("works if there's a render phase update (urgent path)", async () => {
		// Per ReactDeferredValue-test.js:232 — "works if there's a render phase
		// update". The deferred input is synced from props via a render-phase
		// setState; urgent deferral behavior is unchanged.
		let setValue!: (v: number) => void;
		const r = mount(RenderPhaseDeferredHost, { expose: (s: any) => (setValue = s) });
		await act(() => {});
		expect(r.find('#original').textContent).toBe('Original: 1');
		expect(r.find('#deferred').textContent).toBe('Deferred: 1');

		// Urgent update: deferred lags one pass, then catches up.
		flushSync(() => setValue(2));
		expect(r.find('#original').textContent).toBe('Original: 2');
		expect(r.find('#deferred').textContent).toBe('Deferred: 1');
		await act(() => {});
		expect(r.find('#deferred').textContent).toBe('Deferred: 2');
		r.unmount();
	});

	it.fails(
		"works if there's a render phase update (does not defer during a transition)",
		async () => {
			// Per ReactDeferredValue-test.js:232 — the same component updated inside
			// a TRANSITION must commit Original and Deferred in the SAME pass ("if it
			// updates during a transition, it doesn't defer").
			//
			// GAP: a render-phase setState in octane schedules a plain (urgent)
			// re-render instead of inheriting the in-progress render's transition
			// priority (React render-phase updates inherit the current render lanes).
			// The replayed body therefore sees currentRenderMode !== 'transition' and
			// defers, committing the deferred value one microtask later. The direct
			// (non-render-phase) shape has no such gap — see the :108 port above.
			let setValue!: (v: number) => void;
			const r = mount(RenderPhaseDeferredHost, { expose: (s: any) => (setValue = s) });
			await act(() => {});
			expect(r.find('#deferred').textContent).toBe('Deferred: 1');

			flushSync(() => startTransition(() => setValue(2)));
			const original = r.find('#original').textContent;
			const deferred = r.find('#deferred').textContent;
			await act(() => {});
			r.unmount();
			expect(original).toBe('Original: 2');
			// React commits the deferred value in the same render as the original.
			expect(deferred).toBe('Deferred: 2');
		},
	);

	it('regression test: during urgent update, reuse previous value, not initial value', async () => {
		// Per ReactDeferredValue-test.js:298 — after a TRANSITION commit moved the
		// deferred value to 2, a later urgent update to 3 must show "Deferred: 2"
		// (the previous value) — NOT flip back to the initial value 1.
		let setValue!: (v: number) => void;
		const r = mount(RenderPhaseDeferredHost, { expose: (s: any) => (setValue = s) });
		await act(() => {});
		expect(r.find('#deferred').textContent).toBe('Deferred: 1');

		// Non-urgent update. (React commits both in one pass; octane's
		// render-phase-update transition gap — pinned in the :232 it.fails above —
		// adds a microtask before the deferred value lands, so settle with act()
		// before the step this regression test actually targets.)
		flushSync(() => startTransition(() => setValue(2)));
		expect(r.find('#original').textContent).toBe('Original: 2');
		await act(() => {});
		expect(r.find('#deferred').textContent).toBe('Deferred: 2');

		// Urgent update: reuses the CURRENT value (2), not the initial one (1).
		flushSync(() => setValue(3));
		expect(r.find('#original').textContent).toBe('Original: 3');
		expect(r.find('#deferred').textContent).toBe('Deferred: 2');
		await act(() => {});
		expect(r.find('#deferred').textContent).toBe('Deferred: 3');
		r.unmount();
	});

	it('supports initialValue argument', async () => {
		// Per ReactDeferredValue-test.js:374 — "supports initialValue argument".
		// First paint shows Initial; the spawned deferred render commits Final.
		const r = mount(InitialValueApp);
		expect(r.find('#out').textContent).toBe('Initial');
		await act(() => {});
		expect(r.find('#out').textContent).toBe('Final');
		r.unmount();
	});

	it('defers during initial render when initialValue is provided, even if render is not sync', async () => {
		// Per ReactDeferredValue-test.js:390 — the mount happens inside a
		// TRANSITION, but initialValue still shows first.
		let setShow!: (v: boolean) => void;
		const r = mount(TransitionMountGate, { expose: (s: any) => (setShow = s) });
		flushSync(() => startTransition(() => setShow(true)));
		expect(r.find('#out').textContent).toBe('Initial');
		await act(() => {});
		expect(r.find('#out').textContent).toBe('Final');
		r.unmount();
	});

	it('if a suspended render spawns a deferred task, we can switch to the deferred task without finishing the original one (Suspense boundary)', async () => {
		// Per ReactDeferredValue-test.js:484 — both the initial and the final
		// value suspend; the fallback shows. When the FINAL value loads we show
		// it directly, skipping the initial value entirely; the initial value
		// resolving later is a no-op.
		const log = createLog();
		const { getText, resolveText } = makeTextCache(log.push);
		const r = mount(SuspenseInitialFinal, { getText });
		await act(() => {});
		// Both values were attempted (initial first, then the spawned final).
		expect(log.drain()).toEqual([
			'Async text requested [Loading...]',
			'Async text requested [Final]',
		]);
		expect(r.find('#fallback').textContent).toBe('Fallback');

		// The final value loads → we skip the initial value entirely.
		await act(() => resolveText('Final'));
		expect(r.find('#content').textContent).toBe('Final');

		// The initial value loading later changes nothing.
		await act(() => resolveText('Loading...'));
		expect(r.find('#content').textContent).toBe('Final');
		expect(r.findAll('#fallback')).toHaveLength(0);
		r.unmount();
	});

	it.fails(
		'if there are multiple useDeferredValues in the same tree, only the first level defers; subsequent ones go straight to the final value, to avoid a waterfall',
		async () => {
			// Per ReactDeferredValue-test.js:564 — a useDeferredValue hook MOUNTED
			// inside the spawned deferred render must skip its own preview state and
			// go straight to the final value (React intentionally differs from nested
			// Suspense here: the OUTER preview already covered the loading state).
			//
			// GAP: octane's useDeferredValue mount path always returns initialValue
			// and spawns its own deferred swap — it does not know it is rendering
			// inside an already-spawned deferred pass (there is no "deferred lane"
			// bit on the render, only the transition flag, and mount ignores both).
			// So the inner hook renders 'Content Preview' first: a preview waterfall
			// React avoids. Fix hypothesis: thread an "is deferred render" flag from
			// the useDeferredValue-spawned startTransition(scheduleRender) into
			// mount-with-initialValue (and reveal-from-hidden), committing the final
			// value directly there.
			const log = createLog();
			const r = mount(WaterfallApp, { log: log.push });
			expect(r.find('#app-preview').textContent).toBe('App Preview');
			await act(() => {});
			const entries = log.drain();
			const finalHtml = r.find('#content').textContent;
			r.unmount();
			expect(finalHtml).toBe('Content');
			// React never renders the inner preview — this is the failing assertion.
			expect(entries).not.toContain('render:Content Preview');
		},
	);

	it("regression: useDeferredValue's initial value argument works even if an unrelated transition is suspended", async () => {
		// Per ReactDeferredValue-test.js:611 — while screen A's final value is
		// still suspended (transition never finished), remounting a NEW instance
		// (screen B) must show B's preview, not skip/ignore it.
		const log = createLog();
		const { getText, resolveText } = makeTextCache(log.push);
		resolveText('Preview A...');
		resolveText('Preview B...');
		let setText!: (v: string) => void;
		const r = mount(RemountPreviewApp, { getText, expose: (s: any) => (setText = s) });
		await act(() => {});
		// Preview A committed; the final value 'A' is suspended (transition holds
		// the prior content — no fallback).
		expect(r.find('#content').textContent).toBe('Preview A...');

		// Switch to screen B while A's transition is still suspended.
		await act(() => startTransition(() => setText('B')));
		expect(r.find('#content').textContent).toBe('Preview B...');

		// Finish loading the final value.
		await act(() => resolveText('B'));
		expect(r.find('#content').textContent).toBe('B');
		r.unmount();
	});

	it.fails('useDeferredValue can prerender the initial value inside a hidden tree', async () => {
		// Per ReactDeferredValue-test.js:746 — updating a HIDDEN prerendered tree
		// should switch to prerendering the NEW preview state (revealing a hidden
		// tree is treated like a fresh mount, so the preview must exist).
		//
		// GAP: octane's useDeferredValue slot is oblivious to Activity visibility.
		// An update while hidden takes the steady-state path: it returns the
		// previous committed value ('A'), then swaps straight to the final value
		// ('B') on the deferred microtask — the new preview state is never
		// rendered. Fix hypothesis: when the owning block is inside a hidden
		// Activity subtree, treat a changed value like a fresh mount (render
		// initialValue, then spawn the swap).
		const log = createLog();
		const r = mount(ActivityDeferredContainer, { text: 'A', shouldShow: false, log: log.push });
		await act(() => {});
		expect(log.drain()).toEqual(['render:Preview [A]', 'render:A']);

		// Update the still-hidden tree.
		r.update(ActivityDeferredContainer, { text: 'B', shouldShow: false, log: log.push });
		const entries = log.drain();
		await act(() => {});
		r.unmount();
		// React switches to pre-rendering the new preview.
		expect(entries).toContain('render:Preview [B]');
	});

	it('useDeferredValue skips the preview state when revealing a hidden tree if the final value is referentially identical', async () => {
		// Per ReactDeferredValue-test.js:808 — the prerender already committed
		// the final value; revealing with the SAME value must not re-render the
		// preview state (the practical upshot of prerendering).
		const log = createLog();
		const r = mount(ActivityDeferredContainer, { text: 'A', shouldShow: false, log: log.push });
		await act(() => {});
		expect(log.drain()).toEqual(['render:Preview [A]', 'render:A']);

		r.update(ActivityDeferredContainer, { text: 'A', shouldShow: true, log: log.push });
		await act(() => {});
		expect(r.find('#app').textContent).toBe('A');
		// The preview state was never re-rendered.
		expect(log.drain()).not.toContain('render:Preview [A]');
		r.unmount();
	});

	it.fails(
		'useDeferredValue does not skip the preview state when revealing a hidden tree if the final value is different from the currently rendered one',
		async () => {
			// Per ReactDeferredValue-test.js:848 — revealing with a DIFFERENT value
			// cannot bail: React treats the reveal as a fresh mount and shows the
			// preview state first, then the final value.
			//
			// GAP: same root cause as the hidden-prerender case — octane's slot
			// ignores the hidden→visible transition and takes the steady-state defer
			// path, briefly showing the PREVIOUS committed value ('A') instead of the
			// new preview ('Preview [B]').
			const log = createLog();
			const r = mount(ActivityDeferredContainer, { text: 'A', shouldShow: false, log: log.push });
			await act(() => {});
			log.clear();

			r.update(ActivityDeferredContainer, { text: 'B', shouldShow: true, log: log.push });
			const intermediate = r.find('#app').textContent;
			await act(() => {});
			const finalText = r.find('#app').textContent;
			r.unmount();
			expect(finalText).toBe('B');
			// React first commits the preview state — this is the failing assertion.
			expect(intermediate).toBe('Preview [B]');
		},
	);

	it.fails(
		'useDeferredValue does not show "previous" value when revealing a hidden tree (no initial value)',
		async () => {
			// Per ReactDeferredValue-test.js:894 — updating and revealing a hidden
			// tree in the same (sync) update must show the NEW value immediately:
			// conceptually this is a new tree, so there is no "previous" value to
			// defer to.
			//
			// GAP: octane's slot keeps the hidden tree's committed value and defers
			// the urgent update as usual, so 'A' flashes before the microtask commits
			// 'B'. Fix hypothesis: reveal-from-hidden (like mount) should adopt the
			// incoming value directly.
			const log = createLog();
			const r = mount(ActivityNoInitialContainer, { text: 'A', shouldShow: false, log: log.push });
			await act(() => {});
			expect(log.drain()).toEqual(['render:A']);

			r.update(ActivityNoInitialContainer, { text: 'B', shouldShow: true, log: log.push });
			const intermediate = r.find('#app').textContent;
			await act(() => {});
			r.unmount();
			// React commits B in the same sync update.
			expect(intermediate).toBe('B');
		},
	);
});

// ============================================================================
// Accounting — ReactDeferredValue-test.js (React 19.2.7, 18 tests):
//   :108 "does not cause an infinite defer loop if the original value isn't
//        memoized" — PORTED (passes).
//   :171 "does not defer during a transition" — COVERED-BY-EXISTING:
//        transitions.test.ts:361 ('useDeferredValue does NOT defer when called
//        during a transition render') + suspense.test.ts:425 (urgent deferral).
//   :232 "works if there's a render phase update" — PORTED as two tests: the
//        urgent path passes; the no-defer-during-transition half is it.fails
//        (// GAP: render-phase setState re-renders urgently instead of
//        inheriting the in-progress transition priority).
//   :298 "regression test: during urgent update, reuse previous value, not
//        initial value" — PORTED (passes).
//   :374 "supports initialValue argument" — PORTED (passes).
//   :390 "defers during initial render when initialValue is provided, even if
//        render is not sync" — PORTED (passes).
//   :407 "…spawns a deferred task… (no Suspense boundary)" — N/A: requires a
//        parked, uncommitted root-level render (concurrent work-loop
//        machinery). Octane's sync scheduler must commit every pass and
//        requires a boundary for suspension; there is no root-level "attempt"
//        to abandon or switch away from.
//   :442 "…(no Suspense boundary, synchronous parent update)" — N/A: same
//        reason (flushSync variant of :407).
//   :484 "…(Suspense boundary)" — PORTED (passes, outcome-level).
//   :526 "…finish the original task if that one loads first" — N/A: no
//        Suspense boundary (see :407), and choosing between two parked
//        in-flight renders is time-slicing choreography; octane's deferred
//        swap supersedes the initial value as soon as its microtask runs.
//   :564 "only the first level defers…" — PORTED as it.fails (// GAP: no
//        "deferred render" bit; mount always shows initialValue → waterfall).
//   :611 "initial value argument works even if an unrelated transition is
//        suspended" — PORTED (passes).
//   :653 "avoids a useDeferredValue waterfall when separated by a Suspense
//        boundary" — same single gap as :564 (the first-level-only skip);
//        subsumed by the :564 it.fails pin, not separately ported.
//   :699 "can spawn a deferred task while prerendering a hidden tree" — N/A:
//        depends on Suspense pre-warming inside a hidden prerender (offscreen
//        lanes); the non-suspending halves are pinned by the :746/:808 ports.
//   :746 "can prerender the initial value inside a hidden tree" — PORTED as
//        it.fails (// GAP: hidden-tree update doesn't re-show the preview).
//   :808 "skips the preview state when revealing a hidden tree if the final
//        value is referentially identical" — PORTED (passes).
//   :848 "does not skip the preview state when revealing a hidden tree if the
//        final value is different" — PORTED as it.fails (// GAP: reveal is not
//        treated as a fresh mount; previous value flashes).
//   :894 "does not show 'previous' value when revealing a hidden tree (no
//        initial value)" — PORTED as it.fails (// GAP: same reveal root cause).
// ============================================================================
