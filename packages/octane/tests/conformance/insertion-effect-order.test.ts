import { describe, it, expect } from 'vitest';
import { mount, createLog, flushEffects } from '../_helpers';
import { InsertionValueThreading, InterleavedPair } from './_fixtures/insertion-effect-order.tsrx';

// Ports of the useInsertionEffect ORDERING tests from facebook/react
// ReactHooksWithNoopRenderer-test.js:2566-2905 (React 19.2.7). The basic
// phase pipeline (insertion → layout sync, passive post-paint; per-phase
// cleanup-before-body; unmount) is already pinned in tests/effect-timing.test.ts
// and conformance/effect-order.test.ts — these top up what those don't cover:
// committed-value threading between phases, the forced passive flush before a
// new commit's insertion effects, and the cross-component choreography.
//
// NOTE (Activity): insertion effects intentionally stay CONNECTED while a
// subtree is hidden (tests/activity.test.ts). Everything below uses real
// mounts/unmounts, so nothing here bears on that.

describe('conformance: useInsertionEffect ordering (ReactHooksWithNoopRenderer-test.js)', () => {
	it('fires insertion effects before layout effects (mount + update value threading)', () => {
		// Per ReactHooksWithNoopRenderer-test.js:2626 — "fires insertion effects
		// before layout effects". The insertion effect commits `shared.text`
		// BEFORE the layout effect reads it, on mount and across an update; the
		// passive effect sees the committed value only after the paint boundary.
		const log = createLog();
		const shared = { text: '(empty)' };
		const r = mount(InsertionValueThreading, { count: 0, shared, log: log.push });
		expect(log.drain()).toEqual([
			'Create insertion [current: (empty)]',
			'Create layout [current: 0]',
		]);
		expect(shared.text).toBe('0');
		flushEffects();
		expect(log.drain()).toEqual(['Create passive [current: 0]']);

		// Update: insertion cleanup + body run before layout cleanup + body.
		r.update(InsertionValueThreading, { count: 1, shared, log: log.push });
		expect(log.drain()).toEqual([
			'Destroy insertion [current: 0]',
			'Create insertion [current: 0]',
			'Destroy layout [current: 1]',
			'Create layout [current: 1]',
		]);
		expect(shared.text).toBe('1');
		flushEffects();
		expect(log.drain()).toEqual(['Destroy passive [current: 1]', 'Create passive [current: 1]']);
		r.unmount();
	});

	it.fails(
		'on unmount, destroys insertion effects before layout effects, and passive effects after the sync phase',
		() => {
			// Per ReactHooksWithNoopRenderer-test.js:2626 (unmount section) — React
			// destroys the deleted component's effects phase-ordered: insertion
			// cleanup, then layout cleanup (both in the mutation phase), and the
			// passive cleanup later, in the deferred passive flush.
			//
			// GAP: octane's unmountScope unwinds ONE scope.cleanups list in reverse
			// registration order — and effects register in phase-EXECUTION order
			// (insertion → layout → passive) — so unmount fires passive → layout →
			// insertion, all synchronously. Matching React needs a per-phase unmount
			// walk (insertion+layout cleanups sync, passive cleanup deferred to the
			// passive flush). tests/effect-timing.test.ts pins the current reverse
			// order; this pin flips (and that test needs revisiting) if the unmount
			// path is rebuilt phase-ordered.
			const log = createLog();
			const shared = { text: '(empty)' };
			const r = mount(InsertionValueThreading, { count: 0, shared, log: log.push });
			flushEffects();
			log.clear();
			r.unmount();
			const syncEntries = log.drain();
			flushEffects();
			const deferredEntries = log.drain();
			expect(syncEntries).toEqual([
				'Destroy insertion [current: 0]',
				'Destroy layout [current: 0]',
			]);
			expect(deferredEntries).toEqual(['Destroy passive [current: 0]']);
		},
	);

	it('force flushes passive effects before firing new insertion effects', () => {
		// Per ReactHooksWithNoopRenderer-test.js:2676 — "force flushes passive
		// effects before firing new insertion effects". A second commit that
		// lands while the first commit's passive effect is still pending must
		// flush that passive effect FIRST (React's
		// flushPassiveEffects-at-render-start), then run the new insertion work.
		const log = createLog();
		const shared = { text: '(empty)' };
		const r = mount(InsertionValueThreading, { count: 0, shared, log: log.push });
		expect(log.drain()).toEqual([
			'Create insertion [current: (empty)]',
			'Create layout [current: 0]',
		]);
		expect(shared.text).toBe('0');

		// Update BEFORE the mount's passive effect has flushed.
		r.update(InsertionValueThreading, { count: 1, shared, log: log.push });
		expect(log.drain()).toEqual([
			// The pending passive effect from the previous commit fires first…
			'Create passive [current: 0]',
			// …then the new commit's insertion + layout work.
			'Destroy insertion [current: 0]',
			'Create insertion [current: 0]',
			'Destroy layout [current: 1]',
			'Create layout [current: 1]',
		]);
		expect(shared.text).toBe('1');
		flushEffects();
		expect(log.drain()).toEqual(['Destroy passive [current: 1]', 'Create passive [current: 1]']);
		r.unmount();
	});

	it('fires all insertion effects (interleaved) before firing any layout effects — mount', () => {
		// Per ReactHooksWithNoopRenderer-test.js:2741 (mount section) — on mount,
		// EVERY insertion effect across the whole commit fires before ANY layout
		// effect, components in tree order, effects in registration order.
		const log = createLog();
		const state = { A: '(empty)', B: '(empty)' };
		const read = () => `[A: ${state.A}, B: ${state.B}]`;
		const writeA = (v: string) => (state.A = v);
		const writeB = (v: string) => (state.B = v);
		const r = mount(InterleavedPair, { count: 0, read, writeA, writeB, log: log.push });
		expect(log.drain()).toEqual([
			// All insertion effects fire before all layout effects.
			'Create Insertion 1 for Component A [A: (empty), B: (empty)]',
			'Create Insertion 2 for Component A [A: 0, B: (empty)]',
			'Create Insertion 1 for Component B [A: 0, B: (empty)]',
			'Create Insertion 2 for Component B [A: 0, B: 0]',
			'Create Layout 1 for Component A [A: 0, B: 0]',
			'Create Layout 2 for Component A [A: 0, B: 0]',
			'Create Layout 1 for Component B [A: 0, B: 0]',
			'Create Layout 2 for Component B [A: 0, B: 0]',
		]);
		expect([state.A, state.B]).toEqual(['0', '0']);
		r.unmount();
	});

	it.fails(
		'fires all insertion effects (interleaved) before firing any layout effects — update choreography',
		() => {
			// Per ReactHooksWithNoopRenderer-test.js:2741 (update section) — on
			// update, React's mutation-phase walk runs PER FIBER: destroy all of A's
			// insertion effects, create all of A's insertion effects, destroy A's
			// layout effects — then the same for B — and only then creates layout
			// effects (A, then B) in the layout phase.
			//
			// GAP: octane drains effects per PHASE across the whole commit
			// (drainPhase(INSERTION): ALL cleanups commit-wide, then ALL bodies;
			// then drainPhase(LAYOUT) the same way). So octane emits
			// A.ins1⁻ A.ins2⁻ B.ins1⁻ B.ins2⁻ · A.ins1⁺ A.ins2⁺ B.ins1⁺ B.ins2⁺ ·
			// A.lay1⁻ A.lay2⁻ B.lay1⁻ B.lay2⁻ · A.lay1⁺ … — insertion-before-layout
			// still holds (stronger, commit-wide), but React's per-fiber
			// destroy-all/create-all grouping and its mutation-walk interleaving
			// (A's layout destroys BEFORE B's insertion work; B's insertion cleanups
			// AFTER A's insertion bodies) do not. Matching exactly would need a
			// per-scope mutation walk over insertion+layout cleanups.
			const log = createLog();
			const state = { A: '(empty)', B: '(empty)' };
			const read = () => `[A: ${state.A}, B: ${state.B}]`;
			const writeA = (v: string) => (state.A = v);
			const writeB = (v: string) => (state.B = v);
			const r = mount(InterleavedPair, { count: 0, read, writeA, writeB, log: log.push });
			flushEffects();
			log.clear();
			r.update(InterleavedPair, { count: 1, read, writeA, writeB, log: log.push });
			const entries = log.drain();
			const committed = [state.A, state.B];
			r.unmount();
			expect(committed).toEqual(['1', '1']);
			expect(entries).toEqual([
				'Destroy Insertion 1 for Component A [A: 0, B: 0]',
				'Destroy Insertion 2 for Component A [A: 0, B: 0]',
				'Create Insertion 1 for Component A [A: 0, B: 0]',
				'Create Insertion 2 for Component A [A: 1, B: 0]',
				'Destroy Layout 1 for Component A [A: 1, B: 0]',
				'Destroy Layout 2 for Component A [A: 1, B: 0]',
				'Destroy Insertion 1 for Component B [A: 1, B: 0]',
				'Destroy Insertion 2 for Component B [A: 1, B: 0]',
				'Create Insertion 1 for Component B [A: 1, B: 0]',
				'Create Insertion 2 for Component B [A: 1, B: 1]',
				'Destroy Layout 1 for Component B [A: 1, B: 1]',
				'Destroy Layout 2 for Component B [A: 1, B: 1]',
				'Create Layout 1 for Component A [A: 1, B: 1]',
				'Create Layout 2 for Component A [A: 1, B: 1]',
				'Create Layout 1 for Component B [A: 1, B: 1]',
				'Create Layout 2 for Component B [A: 1, B: 1]',
			]);
		},
	);
});

// ============================================================================
// Accounting — ReactHooksWithNoopRenderer-test.js useInsertionEffect block
// (:2566-3050), scoped to the ordering tests (:2564-2738 + the interleaved
// case):
//   :2567 "fires insertion effects after snapshots on update" — the
//        getSnapshotBeforeUpdate half is N/A (class-component lifecycle; no
//        octane equivalent). The residual observable (destroy→create insertion
//        on update; destroy on unmount) is COVERED-BY-EXISTING:
//        tests/effect-timing.test.ts ('phase order on re-render', 'all phases
//        fire cleanup on unmount').
//   :2626 "fires insertion effects before layout effects" — PORTED as two
//        tests: mount+update value threading (passes); the unmount section is
//        it.fails (// GAP: reverse-registration unmount order + synchronous
//        passive cleanup vs React's insertion→layout sync, passive deferred).
//   :2676 "force flushes passive effects before firing new insertion effects"
//        — PORTED (passes; octane adaptation drives the second commit with a
//        sync update instead of a transition — the pending-passive-flush-
//        before-render rule is the behavior under test, and octane applies it
//        on every render pass).
//   :2741 "fires all insertion effects (interleaved) before firing any layout
//        effects" — PORTED as two tests: mount choreography (passes, exact
//        React log); update choreography is it.fails (// GAP: per-phase commit
//        drain vs React's per-fiber mutation walk). The unmount tail of the
//        React test repeats the :2626 unmount gap and is not re-pinned.
//   :2907 "assumes insertion effect destroy function is either a function or
//        undefined" — N/A: DEV-warning policy (octane's warning policy
//        differs; per plan §2, functional outcome only).
//   :2967 / :3006 "warns when setState is called from insertion effect
//        setup/cleanup" — N/A: DEV-warning policy.
// ============================================================================
