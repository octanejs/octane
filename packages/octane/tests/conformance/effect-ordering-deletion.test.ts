/**
 * Parent → Child → Grandchild effect ORDERING across mount and DELETION.
 *
 * Ported from facebook/react ReactEffectOrdering-test.js. React's contract:
 *   - MOUNT setups fire CHILD-first  (post-order commit; grandchild → child →
 *     parent). Octane already documents + pins this (scheduler-priority.test.ts);
 *     re-confirmed here as the positive control.
 *   - DELETION cleanups fire PARENT-first (parent → child → grandchild) — the
 *     REVERSE of mount — for BOTH useLayoutEffect (ReactEffectOrdering-test.js:37)
 *     and useEffect / passive (ReactEffectOrdering-test.js:64).
 *
 * GAP: Octane's unmount walk recurses into children BEFORE running a scope's own
 * cleanups, so deletion cleanups fire CHILD-first — the OPPOSITE of React. This
 * is independently pinned (child-first) in scheduler-priority.test.ts:113
 * ("cleanup on unmount stays child-first"). The two deletion-order assertions
 * below therefore encode the DESIRED React behavior (parent-first) and are marked
 * `it.fails` until the runtime flips its unmount order to parent-before-child.
 */
import { describe, it, expect } from 'vitest';
import { mount, act, flushEffects, createLog } from '../_helpers';
import {
	LayoutParent,
	PassiveParent,
	LayoutToggleHost,
} from '../_fixtures/effect-ordering-deletion.tsrx';

describe('effect ordering on deletion (parent → child)', () => {
	// ── Positive controls: MOUNT setups fire child-first ──────────────────────

	it('layout setups on MOUNT fire child-first (grandchild → child → parent)', () => {
		// Per ReactEffectOrdering-test.js (inverse of :37) — layout commit is
		// post-order, so the deepest grandchild's setup runs first.
		const log = createLog();
		const r = mount(LayoutParent, { log: log.push });
		// Layout effects flush synchronously inside mount's flushSync.
		const observed = log.drain();
		r.unmount();
		expect(observed).toEqual([
			'mount layout Grandchild',
			'mount layout Child',
			'mount layout Parent',
		]);
	});

	it('passive setups on MOUNT fire child-first (grandchild → child → parent)', async () => {
		// Per ReactEffectOrdering-test.js (inverse of :64) — passive commit is
		// also post-order.
		const log = createLog();
		const r = mount(PassiveParent, { log: log.push });
		await act(async () => {});
		flushEffects();
		const observed = log.drain();
		r.unmount();
		expect(observed).toEqual([
			'mount passive Grandchild',
			'mount passive Child',
			'mount passive Parent',
		]);
	});

	// ── Deletion ordering: React fires cleanups parent-first ──────────────────

	it.fails(
		'layout cleanups on DELETION fire parent → child (React parent-first)',
		() => {
			// Per ReactEffectOrdering-test.js:37 —
			//   'layout unmounts on deletion are fired in parent -> child order'
			// GAP — ReactEffectOrdering-test.js:37: Octane's unmountScope recurses
			// into children before running its own scope.cleanups, so cleanups fire
			// CHILD-first (Grandchild → Child → Parent), the OPPOSITE of React. Same
			// divergence pinned in scheduler-priority.test.ts:113.
			const log = createLog();
			const r = mount(LayoutParent, { log: log.push });
			log.drain(); // discard mount setups
			r.unmount();
			const observed = log.drain();
			// (no further mounted container to clean up — already unmounted)
			expect(observed).toEqual([
				'cleanup layout Parent',
				'cleanup layout Child',
				'cleanup layout Grandchild',
			]);
		},
	);

	it.fails(
		'passive cleanups on DELETION fire parent → child (React parent-first)',
		async () => {
			// Per ReactEffectOrdering-test.js:64 —
			//   'passive unmounts on deletion are fired in parent -> child order'
			// GAP — ReactEffectOrdering-test.js:64: same child-first unmount walk;
			// passive cleanups also fire Grandchild → Child → Parent in Octane.
			const log = createLog();
			const r = mount(PassiveParent, { log: log.push });
			await act(async () => {});
			flushEffects();
			log.drain(); // discard mount setups
			r.unmount();
			flushEffects();
			const observed = log.drain();
			expect(observed).toEqual([
				'cleanup passive Parent',
				'cleanup passive Child',
				'cleanup passive Grandchild',
			]);
		},
	);

	it.fails(
		'layout cleanups via @if-toggle deletion fire parent → child',
		() => {
			// Per ReactEffectOrdering-test.js:37 — a reconciler-driven removal
			// (the @if branch going false) is the same deletion path as a root
			// unmount and must order cleanups parent → child.
			// GAP — ReactEffectOrdering-test.js:37: child-first unmount walk applies
			// to branch deletions too.
			const log = createLog();
			const r = mount(LayoutToggleHost, { show: true, log: log.push });
			log.drain(); // discard mount setups
			r.update(LayoutToggleHost, { show: false, log: log.push });
			const observed = log.drain();
			r.unmount();
			expect(observed).toEqual([
				'cleanup layout Parent',
				'cleanup layout Child',
				'cleanup layout Grandchild',
			]);
		},
	);

	// ── Observed-order documentation control (always green) ───────────────────

	it('DOCUMENTS Octane current deletion order: cleanups fire child-first', () => {
		// Pins the ACTUAL Octane behavior so a future runtime change to
		// parent-first deletion (which would flip the it.fails tests above to
		// green) is forced to also update THIS assertion — keeping the gap
		// documentation honest. Mirrors scheduler-priority.test.ts:113.
		const log = createLog();
		const r = mount(LayoutParent, { log: log.push });
		log.drain();
		r.unmount();
		const observed = log.drain();
		expect(observed).toEqual([
			'cleanup layout Grandchild',
			'cleanup layout Child',
			'cleanup layout Parent',
		]);
	});
});
