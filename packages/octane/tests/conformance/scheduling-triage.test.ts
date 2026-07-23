// Tier 6 — scheduling / lanes / batching triage ports.
//
// Octane's scheduler is SYNCHRONOUS: one microtask-batched queue with two
// priorities (urgent + transition) and no lanes, no time-slicing, no
// expiration. Most of React's scheduling suite exercises concurrent
// mechanisms (mid-render yields, lane-separated work loops, expiration
// clocks) that cannot exist here; this file ports the halves that ARE
// observable in a synchronous scheduler and asserts intentional divergences
// as ordinary passing tests with explicit rationale. The complete per-`it`
// triage table for
// ReactFlushSync-test.js, ReactBatching-test.internal.js,
// ReactUpdatePriority-test.js, ReactIncrementalUpdates-test.js,
// ReactInterleavedUpdates-test.js and ReactExpiration-test.js is the
// trailing comment block at the bottom of this file.
import { describe, it, expect } from 'vitest';
import { createRoot, flushSync } from '../../src/index.js';
import { mount, act, flushEffects } from '../_helpers';
import {
	drainSchedLog,
	Plain,
	ThrowSwitch,
	PhaseLogger,
	bumpPhaseLogger,
	LaneCells,
	bumpUrgentCell,
	bumpTransitionCell,
	EffectSpawn,
	PassiveSpawnSuspends,
	spawnStepInTransition,
	LabelState,
	getLabelRenders,
	dispatchMixedPriority,
} from './_fixtures/scheduling-triage.tsrx';

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (v: T) => void;
	reject: (e: any) => void;
}
function deferred<T>(): Deferred<T> {
	let resolve!: (v: T) => void, reject!: (e: any) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('ReactFlushSync-test.js ports', () => {
	it('flushSync with no scheduled render does NOT flush pending passive effects', () => {
		// Per ReactFlushSync-test.js:269 — 'does not flush pending passive effects'.
		// Passive effects queued by an earlier commit stay pending across an empty
		// flushSync; they fire on the normal post-paint path.
		const r = mount(PhaseLogger);
		expect(drainSchedLog()).toEqual(['render:0', 'layout:0']); // passive still queued
		flushSync(() => {});
		expect(drainSchedLog()).toEqual([]); // untouched by flushSync
		flushEffects(); // the post-paint drain
		expect(drainSchedLog()).toEqual(['effect:0']);
		r.unmount();
	});

	// Per ReactFlushSync-test.js:162 — React flushes passive effects before
	// flushSync returns WHEN they resulted from the sync render it performed.
	// INTENTIONAL DIVERGENCE (adjudicated 2026-07-05): octane's commitEffects
	// ALWAYS defers passives to the post-paint scheduler, flushSync included —
	// the deliberate contract already pinned by tests/effect-timing.test.ts
	// ('flushSync drains insertion+layout but NOT passive'). Passives are
	// post-paint by design; there is no sync-render carve-out.
	it('flushSync commits render + layout synchronously; passives stay post-paint', () => {
		const r = mount(PhaseLogger);
		flushEffects();
		drainSchedLog();
		flushSync(() => bumpPhaseLogger(1));
		const log = drainSchedLog();
		expect(log).toContain('render:1');
		expect(log).toContain('layout:1');
		expect(log).not.toContain('effect:1'); // deferred to post-paint by design
		flushEffects();
		expect(drainSchedLog()).toEqual(['effect:1']);
		r.unmount();
	});

	it('passive effects of a microtask-batched render do not flush in that batch', async () => {
		// Per ReactFlushSync-test.js:246 — "does not flush passive effects
		// synchronously when they aren't the result of a sync render". The
		// microtask flush commits render + layout; passive waits for post-paint.
		const r = mount(PhaseLogger);
		flushEffects();
		drainSchedLog();
		bumpPhaseLogger(1); // plain setter — batched to the microtask flush
		expect(drainSchedLog()).toEqual([]); // nothing ran synchronously
		await Promise.resolve(); // the armed microtask flush runs
		expect(drainSchedLog()).toEqual(['render:1', 'layout:1']); // no 'effect:1'
		flushEffects();
		expect(drainSchedLog()).toEqual(['effect:1']);
		r.unmount();
	});

	it('completely exhausts the flush queue even when earlier roots throw; failed roots unmount', () => {
		// Per ReactFlushSync-test.js:293 — 'completely exhausts synchronous work
		// queue even if something throws'. Three roots re-rendered in one
		// flushSync: roots 1+2 throw, root 3 must still commit; the erroring
		// roots' trees unmount (React 19: an unhandled error unmounts the root);
		// the error still surfaces out of flushSync after the queue drains.
		const containers = [0, 1, 2].map(() => {
			const c = document.createElement('div');
			document.body.appendChild(c);
			return c;
		});
		const roots = containers.map((c) => createRoot(c));
		flushSync(() => {
			roots[0].render(ThrowSwitch, { error: null, text: 'Hi' });
			roots[1].render(ThrowSwitch, { error: null, text: 'Andrew' });
			roots[2].render(ThrowSwitch, { error: null, text: '!' });
		});
		expect(drainSchedLog()).toEqual(['text:Hi', 'text:Andrew', 'text:!']);

		const aahh = new Error('AAHH!');
		const nooo = new Error('Noooooooooo!');
		let error: any = null;
		try {
			flushSync(() => {
				roots[0].render(ThrowSwitch, { error: aahh });
				roots[1].render(ThrowSwitch, { error: nooo });
				roots[2].render(ThrowSwitch, { error: null, text: 'aww' });
			});
		} catch (e) {
			error = e;
		}
		// The update to root 3 finished synchronously despite the earlier errors.
		expect(drainSchedLog()).toEqual(['text:aww']);
		expect(containers[2].textContent).toBe('aww');
		// Roots 1 and 2 were unmounted.
		expect(containers[0].textContent).toBe('');
		expect(containers[1].textContent).toBe('');
		// Both unhandled errors surfaced out of flushSync as an AggregateError
		// (React parity — the dedicated test below covers the aggregation shape).
		expect(error).toBeInstanceOf(AggregateError);
		expect(error.errors).toEqual([aahh, nooo]);
		for (const root of roots) root.unmount();
		for (const c of containers) c.remove();
	});

	// Per ReactFlushSync-test.js:293 (tail) — several roots throwing in ONE
	// synchronous flush aggregate every unhandled error into an AggregateError.
	// octane matches: drainQueue collects all unhandled errors; >1 → AggregateError
	// (a single error still rethrows as-is, per the test above).
	it('multiple root errors in one flushSync aggregate into an AggregateError', () => {
		// Per ReactFlushSync-test.js:293 (tail assertions) — 'Because there were
		// multiple errors, React threw an AggregateError.'
		const c1 = document.createElement('div');
		const c2 = document.createElement('div');
		document.body.appendChild(c1);
		document.body.appendChild(c2);
		const r1 = createRoot(c1);
		const r2 = createRoot(c2);
		flushSync(() => {
			r1.render(ThrowSwitch, { error: null, text: 'a' });
			r2.render(ThrowSwitch, { error: null, text: 'b' });
		});
		drainSchedLog();
		const aahh = new Error('AAHH!');
		const nooo = new Error('Noooooooooo!');
		let error: any = null;
		try {
			flushSync(() => {
				r1.render(ThrowSwitch, { error: aahh });
				r2.render(ThrowSwitch, { error: nooo });
			});
		} catch (e) {
			error = e;
		}
		c1.remove();
		c2.remove();
		expect(error).toBeInstanceOf(AggregateError); // ← octane: plain first error
		expect(error.errors).toEqual([aahh, nooo]);
	});

	// Per ReactFlushSync-test.js:121 ('1, 0' mid-event) / ReactBatching:137 —
	// React's flushSync flushes only the sync lane, leaving pending transition
	// work for the concurrent work loop.
	// INTENTIONAL DIVERGENCE (adjudicated 2026-07-05): octane's flushSync drains
	// the WHOLE queue — its two-priority scheduler has one queue and no separate
	// work loops, and the transition-commit-visible-in-the-same-flush behavior is
	// the deliberate contract pinned by tests/transitions.test.ts. Priority
	// governs SUSPENSE HOLD semantics (transition renders keep prior content on
	// suspend), not commit deferral. Final-state parity holds (next test).
	it('flushSync drains queued transition work in the same flush (whole-queue design)', () => {
		const r = mount(LaneCells);
		bumpTransitionCell(1); // queued at transition priority, microtask armed
		flushSync(() => bumpUrgentCell(1));
		const urgent = r.find('#lane-urgent').textContent;
		const transition = r.find('#lane-transition').textContent;
		r.unmount();
		expect(urgent).toBe('U1');
		expect(transition).toBe('T1'); // whole queue drained — octane's contract
	});

	it('transition work pending at flushSync still commits by the end of the event (final-state parity)', async () => {
		// Per ReactFlushSync-test.js:121 (tail: '1, 1') and
		// ReactBatching-test.internal.js:137 (tail: 'A1B1') — whatever the
		// intermediate lane split, both updates are committed once the event's
		// scheduled work drains. This half holds in octane and React alike.
		const r = mount(LaneCells);
		await act(() => {
			bumpTransitionCell(1);
			flushSync(() => bumpUrgentCell(1));
		});
		expect(r.find('#lane-urgent').textContent).toBe('U1');
		expect(r.find('#lane-transition').textContent).toBe('T1');
		r.unmount();
	});
});

describe('ReactBatching-test.internal.js ports', () => {
	it('a root re-render is batched to the microtask flush, not committed synchronously', async () => {
		// Per ReactBatching-test.internal.js:59 — 'updates flush without yielding
		// in the next event'. A root.render() update (same body, new props) is
		// scheduled, not committed inline; the microtask flush commits it in one
		// batch. (Divergence note, not asserted: octane renders the FIRST mount of
		// a root synchronously inside root.render(); React defers that too.)
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		flushSync(() => root.render(Plain, { text: 'A' }));
		drainSchedLog();
		root.render(Plain, { text: 'B' }); // batched — the "next event"'s update
		expect(container.textContent).toBe('A'); // nothing rendered yet
		expect(drainSchedLog()).toEqual([]);
		await Promise.resolve(); // microtask flush
		expect(container.textContent).toBe('B');
		expect(drainSchedLog()).toEqual(['text:B']);
		root.unmount();
		container.remove();
	});

	it('layout effects flush in the same batch as their render, before any post-paint work', async () => {
		// Per ReactBatching-test.internal.js:77 — 'layout updates flush
		// synchronously in same event'. The microtask flush that renders also
		// runs the layout effect; the browser never regains control in between.
		const r = mount(PhaseLogger);
		flushEffects();
		drainSchedLog();
		bumpPhaseLogger(1);
		await Promise.resolve();
		// render + layout in ONE batch; passive still pending (post-paint).
		expect(drainSchedLog()).toEqual(['render:1', 'layout:1']);
		r.unmount();
	});
});

describe('ReactUpdatePriority-test.js ports', () => {
	it('setState inside a passive effect commits in a later batch, not the flush that spawned it', async () => {
		// Per ReactUpdatePriority-test.js:38 — 'setState inside passive effect
		// triggered by sync update should have default priority': the effect's
		// update must NOT ride along with the flush that ran the effect. Also the
		// octane-observable half of ReactInterleavedUpdates-test.js:35 — an update
		// fired from a post-commit callback lands in the NEXT batch, never in the
		// commit that scheduled it.
		const r = mount(EffectSpawn);
		expect(r.find('#es').textContent).toBe('1');
		flushEffects(); // runs the effect; its setState is queued, not committed
		expect(r.find('#es').textContent).toBe('1');
		await Promise.resolve(); // the spawned update's own batch
		expect(r.find('#es').textContent).toBe('2');
		r.unmount();
	});

	it('an update spawned by a passive effect after a transition render is urgent: suspending shows the fallback', async () => {
		// Per ReactUpdatePriority-test.js:38/:59 — updates scheduled inside
		// passive effects do NOT inherit the transition; React assigns them the
		// default lane (the transition context is gone by effect time), so a
		// suspend replaces committed content with the fallback instead of holding
		// it. Octane matches: by passive-drain time TRANSITION_DEPTH is 0 and (no
		// async action in flight) ASYNC_TRANSITION_COUNT is 0, so the setter is
		// urgent. Empirically pins the ASYNC-window semantics for the sync case.
		const p2 = deferred<string>();
		const r = mount(PassiveSpawnSuspends, { p2: p2.promise });
		const value = r.find('#ps-value') as HTMLElement;
		expect(value.textContent).toBe('plain0');
		await act(() => {
			spawnStepInTransition(1); // transition render commits 'plain1'; its
			// passive effect fires setStep(2), which suspends on p2
		});
		// Urgent suspend → fallback and the committed primary host is hidden (a
		// transition-priority suspend would keep 'plain1' visible instead).
		expect(r.findAll('#ps-fallback').length).toBe(1);
		expect(r.find('#ps-value')).toBe(value);
		expect(value.isConnected).toBe(true);
		expect(value.style.display).toBe('none');
		await act(() => {
			p2.resolve('two');
		});
		expect(r.find('#ps-value')).toBe(value);
		expect(value.style.display).toBe('');
		expect(value.textContent).toBe('two');
		r.unmount();
	});
});

describe('ReactIncrementalUpdates-test.js ports', () => {
	it('mixed transition+urgent updates in one event apply in dispatch order (final-state parity)', async () => {
		// Per ReactIncrementalUpdates-test.js:46 — 'applies updates in order of
		// priority'. React first commits only the urgent update ('a'), then
		// replays the FULL queue in insertion order → final 'bca'. Octane has no
		// lane-separated replay: the one batch applies b, c, a in dispatch order —
		// the SAME final state, in a single render. (The intermediate urgent-only
		// commit is the lane mechanism and is not observable here — see triage.)
		const r = mount(LabelState);
		const base = getLabelRenders();
		await act(() => {
			dispatchMixedPriority();
		});
		expect(r.find('#label').textContent).toBe('bca');
		// One batch → one re-render (React takes two commits to reach the same
		// state; octane's single-queue batching folds them).
		expect(getLabelRenders()).toBe(base + 1);
		r.unmount();
	});
});

/*
================================================================================
TIER 6 TRIAGE TABLE — every `it` in the six React source files, classified
PORT / N/A / COVERED. React sources: react-reconciler/src/__tests__ @ v19.2.7.
================================================================================

ReactFlushSync-test.js (8)
  :81  'changes priority of updates in useEffect'
       N/A — needs waitForPaint mid-act plus a sync-vs-default lane split INSIDE
       one passive effect (two separate commits from one effect) and React's
       "flushSync was called from inside a lifecycle method" dev warning; octane
       has one urgent lane, so both updates land in a single batch. Final-state
       parity ('1, 1') is subsumed by the :38 ReactUpdatePriority port.
  :121 'supports nested flushSync with startTransition'
       PORT (split): cross-block lane isolation ADJUDICATED as an INTENTIONAL
       DIVERGENCE (2026-07-05) — octane's flushSync drains the whole two-priority
       queue by design (transitions.test.ts pins the same-flush transition
       commit); ported as a positive whole-queue contract test + final-state
       parity. The SAME-BLOCK half (one component committing '1, 0' then
       '1, 1') is N/A — octane's per-block scheduling granularity cannot
       express two lane-separated commits of a single component.
  :162 'flushes passive effects synchronously when they are the result of a
       sync render'
       ADJUDICATED as an INTENTIONAL DIVERGENCE (2026-07-05) — passives are
       post-paint by design, flushSync included (the deliberate pin in
       tests/effect-timing.test.ts); ported as a positive contract test.
  :187 'does not flush passive effects synchronously after render in legacy mode'
       N/A — legacy-mode gate; octane is concurrent-root only (plan §2).
  :212 'flushes pending passive effects before scope is called in legacy mode'
       N/A — legacy-mode gate. The non-legacy analog (pending passives flush
       before a NEW sync render begins) is octane behavior, already pinned by
       tests/effect-timing.test.ts ('pending passive effects flush BEFORE a
       layout-cascade render mounts new children').
  :246 "does not flush passive effects synchronously when they aren't the
       result of a sync render"
       PORT — passives from a microtask-batched render fire post-paint only.
  :269 'does not flush pending passive effects'
       PORT — empty flushSync leaves previously-queued passives pending.
  :293 'completely exhausts synchronous work queue even if something throws'
       PORT — queue exhaustion + failed-root unmount + error surfacing, AND the
       AggregateError aggregation (FIXED 2026-07-05: drainQueue collects every
       unhandled error; >1 in one flush throws AggregateError, React parity).

ReactBatching-test.internal.js (4)
  :59  'updates flush without yielding in the next event'
       PORT — a root.render() UPDATE is batched to the microtask flush and
       commits in one batch. Divergence noted (not asserted): octane renders the
       FIRST mount of a root synchronously inside root.render(); React defers
       the initial mount to the work loop too.
  :77  'layout updates flush synchronously in same event'
       PORT — layout effects run inside the same microtask batch as their
       render, before the browser regains control (flushSync path already
       pinned by tests/effect-timing.test.ts).
  :96  'uses proper Suspense semantics, not legacy ones'
       COVERED — tests/suspense.test.ts 'does not call lifecycles of a
       suspended component (hooks)': the suspended primary tree does not commit
       (its effects never fire) while the fallback mounts.
  :137 'flushSync does not flush batched work'
       N/A (direct form) — the test needs a default lane distinct from sync:
       octane's single urgent lane makes the earlier batched update and the
       flushSync update the SAME priority, so draining both is consistent with
       "flushSync flushes its own lane". The octane-mappable half (flushSync
       leaving TRANSITION work pending) is the :121 intentional divergence
       above (whole-queue drain by design); final-state parity ported plain.

ReactUpdatePriority-test.js (3)
  :38  'setState inside passive effect triggered by sync update should have
       default priority'
       PORT — the effect-spawned update commits in a LATER batch, never the
       flush that ran the effect; plus the suspense-observable priority pin
       (effect-spawned update is urgent ⇒ fallback, does not inherit the
       transition — octane's urgent ≡ React's default here, verified
       empirically for the sync-transition case; the process-global
       ASYNC_TRANSITION_COUNT window (runtime.ts:437) remains the documented
       caveat for in-flight async actions).
  :59  'setState inside passive effect triggered by idle update should have
       idle priority'
       N/A — requires an idle lane BELOW default (a default update overtakes
       the pending idle one between paints); octane has exactly two priorities
       and no idle, and the overtake needs waitForPaint yield points.
  :109 'continuous updates should interrupt transitions'
       N/A — requires interrupting a PARTIALLY-rendered transition (waitFor
       mid-render yield) and a continuous priority level; octane renders
       synchronously to completion — no yield points exist to interrupt, and
       there is no continuous lane.

ReactIncrementalUpdates-test.js (16)
  :46  'applies updates in order of priority'
       PORT (final state) — mixed transition+urgent updates queued in one event
       all apply in dispatch order in a single batch, reaching React's exact
       final state ('bca'). The intermediate urgent-only commit ({a} first) is
       N/A — it needs lane-separated work loops.
  :74  'applies updates with equal priority in insertion order'
       COVERED — conformance/react-hooks-scenarios.test.ts ('two functional
       updaters in one handler produce +2', 'setN(5) then setN(p => p + 1) ends
       at 6'): same-priority updates apply in insertion order within a batch.
  :95  'only drops updates with equal or lesser priority when replaceState is
       called'
       N/A — class replaceState API (no hook analog exists; useState has no
       replace-and-drop-lanes semantics).
  :138 'can abort an update, schedule additional updates, and resume'
       N/A — aborting/resuming a partially-rendered transition requires waitFor
       mid-render yields; octane renders synchronously to completion, so no
       render is ever aborted or rebased.
  :201 'can abort an update, schedule a replaceState, and resume'
       N/A — same as :138 plus class replaceState.
  :267 'passes accumulation of previous updates to replaceState updater'
       N/A — class replaceState API.
  :290 'does not call callbacks that are scheduled by another callback until a
       later commit'
       N/A — class setState(partial, callback) second-argument callback; hooks
       (React and octane alike) have no setState callback.
  :319 'gives setState during reconciliation the same priority as whatever
       level is currently reconciling'
       COVERED (outcome) — conformance/derived-state.test.ts ('derives state
       from a changed prop during render and commits the converged value'): a
       render-phase update re-renders within the SAME flush, before commit.
       The lane-inheritance mechanism itself is N/A (no lanes).
  :348 'updates triggered from inside a class setState updater'
       N/A — class updater-with-side-effect mechanics + its deduplicated dev
       warning; the hook-observable analog (render-phase update converging in
       the same flush) is covered by conformance/derived-state.test.ts.
  :402 'getDerivedStateFromProps should update base state of updateQueue'
       N/A — class gDSFP + update-queue base-state internals.
  :450 'regression: does not expire soon due to layout effects in the last batch'
       N/A — lane expiration timing; octane has no expiration.
  :490 'regression: does not expire soon due to previous flushSync'
       N/A — lane expiration timing.
  :515 'regression: does not expire soon due to previous expired work'
       N/A — lane expiration timing.
  :555 'when rebasing, does not exclude updates that were already committed,
       regardless of priority'
       N/A — the fixture's C/D cascade keys off an intermediate lane-separated
       commit ('B' alone) that a single-batch scheduler never produces; the
       rebase-drops-committed-updates bug it guards against cannot occur
       without rebasing (octane applies each update exactly once, in dispatch
       order, within one batch — see the :46 port).
  :599 'when rebasing, … (classes)'
       N/A — class variant of :555.
  :641 "base state of update queue is initialized to its fiber's memoized state"
       N/A — double-buffered alternate-fiber base-state internals driven
       through class gDSFP; octane has no alternate fibers or update-queue
       rebasing. The public outcome (a props change and a setState in one
       batch both apply) is generic batching, covered by
       conformance/react-hooks-scenarios.test.ts.

ReactInterleavedUpdates-test.js (2)
  :35  'update during an interleaved event is not processed during the current
       render'
       N/A — needs an event to fire BETWEEN yields of a partially-rendered
       concurrent tree (waitFor([1]) mid-render); octane renders synchronously,
       so no mid-render event window exists and tearing of this shape is
       impossible by construction. The adjacent octane-observable half (an
       update fired from a post-commit callback lands in the NEXT batch, not
       the in-flight commit) is ported in the ReactUpdatePriority:38 test.
  :89  'regression for #24350: does not add to main update queue until
       interleaved update queue has been cleared'
       N/A — interleaved-queue bookkeeping only exists in a yielding renderer;
       octane has a single queue and each batch fully commits before the next
       event can schedule (last-update-wins across sequential transitions is
       trivially guaranteed and already exercised throughout
       tests/transitions.test.ts).

ReactExpiration-test.js (14) — no expiration, no time-slicing, no lanes: work
never waits past the current microtask, so nothing can age, starve, or expire.
  :118 'increases priority of updates as time progresses'
       N/A — time-based lane escalation; octane flushes within one microtask,
       work never waits long enough to age.
  :142 'two updates of like priority in the same event always flush within the
       same batch'
       COVERED (outcome) — conformance/react-hooks-scenarios.test.ts ('setN +
       setM in one handler produces exactly ONE re-render'; 'external setters
       … fired in the same microtask also batch into ONE render'). The
       expiration-time-quantization mechanism being tested is N/A.
  :196 "two updates of like priority in the same event always flush within the
       same batch, even if there's a sync update in between"
       N/A — needs a default lane distinct from sync (the interposed flushSync
       must NOT drain the first default update); in octane the sync flush
       drains the whole urgent queue. Batching outcome covered as :142.
  :260 'cannot update at the same expiration time that is already rendering'
       N/A — expiration-time bucketing internals.
  :321 'stops yielding if CPU-bound update takes too long to finish'
       N/A — time-slicing yield loop; octane never yields.
  :349 'root expiration is measured from the time of the first update'
       N/A — expiration clock.
  :378 'should measure expiration times relative to module initialization'
       N/A — expiration clock.
  :417 'should measure callback timeout relative to current time, not start-up
       time'
       N/A — scheduler callback-timeout internals.
  :439 'prevents starvation by sync updates by disabling time slicing if too
       much time has elapsed'
       N/A — starvation/time-slicing; octane transitions flush in the same
       microtask batch as urgent work, so they cannot be starved.
  :512 'idle work never expires'
       N/A — no idle lane, no expiration.
  :578 'when multiple lanes expire, we can finish the in-progress one without
       including the others'
       N/A — multi-lane expiration.
  :630 'updates do not expire while they are IO-bound'
       N/A — expiration clock interaction with a suspended concurrent render.
  :683 'flushSync should not affect expired work'
       N/A — expiration; octane's flushSync draining semantics are pinned by
       the ReactFlushSync ports above.
  :727 'passive effects of expired update flush after paint'
       COVERED (outcome) — tests/effect-timing.test.ts ('flushSync drains
       insertion+layout but NOT passive'): passives always fire post-paint.
       The 'expired update' precondition is N/A.
================================================================================
*/
