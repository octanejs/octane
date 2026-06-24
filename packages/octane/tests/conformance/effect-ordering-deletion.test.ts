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
 * Octane's unmount walk (runtime.ts unmountScope / fireCleanupsOnly) fires each
 * scope's own cleanups BEFORE recursing into children, so deletion cleanups run
 * parent → child to match React. (Also pinned in scheduler-priority.test.ts.)
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

	it('layout cleanups on DELETION fire parent → child (React parent-first)', () => {
		// Per ReactEffectOrdering-test.js:37 —
		//   'layout unmounts on deletion are fired in parent -> child order'
		const log = createLog();
		const r = mount(LayoutParent, { log: log.push });
		log.drain(); // discard mount setups
		r.unmount();
		const observed = log.drain();
		expect(observed).toEqual([
			'cleanup layout Parent',
			'cleanup layout Child',
			'cleanup layout Grandchild',
		]);
	});

	it('passive cleanups on DELETION fire parent → child (React parent-first)', async () => {
		// Per ReactEffectOrdering-test.js:64 —
		//   'passive unmounts on deletion are fired in parent -> child order'
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
	});

	it('layout cleanups via @if-toggle deletion fire parent → child', () => {
		// Per ReactEffectOrdering-test.js:37 — a reconciler-driven removal (the
		// @if branch going false) is the same deletion path as a root unmount and
		// must order cleanups parent → child.
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
	});
});
