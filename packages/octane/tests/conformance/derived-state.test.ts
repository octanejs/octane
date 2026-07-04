// Render-phase (derived-state) useState semantics + bailout edges.
//
// React replaced getDerivedStateFromProps with "set state during render":
// a guarded setState in the render body re-renders immediately (before
// children/commit) and converges; an unguarded one is capped with
// "Too many re-renders". Per ReactHooksWithNoopRenderer-test.js
// ("...updates state during render") and ReactDOMHooks-test.js. These pin
// octane's equivalents plus the bailout edges the base suites left open.
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushEffects, createLog } from '../_helpers';
import {
	resetRenderCount,
	getRenderCount,
	DerivedFromProp,
	ConvergingClamp,
	UnguardedRenderLoop,
	CaughtRenderLoop,
	InitialFromProp,
	SameValueEffectSkip,
	getEffectRuns,
	resetEffectRuns,
	BailThenChange,
	UpdaterSeesPending,
	getUpdaterArgs,
	resetUpdaterArgs,
	SetThenRevert,
	CleanupClosure,
} from './_fixtures/derived-state.tsrx';

beforeEach(() => {
	resetRenderCount();
	resetEffectRuns();
	resetUpdaterArgs();
});

describe('useState — guarded render-phase update (derived state)', () => {
	it('derives state from a changed prop during render and commits the converged value', () => {
		const r = mount(DerivedFromProp, { value: 1 });
		expect(r.find('#out').textContent).toBe('2');
		const renders = getRenderCount();

		r.update(DerivedFromProp, { value: 3 });
		// The prop render sets state during render, which re-renders the block in
		// the same flush: two body invocations, one committed DOM state.
		expect(r.find('#out').textContent).toBe('6');
		expect(getRenderCount()).toBe(renders + 2);
		r.unmount();
	});

	it('a multi-step render-phase chain converges before commit', () => {
		const r = mount(ConvergingClamp, { target: 5 });
		expect(r.find('#out').textContent).toBe('5');
		// Mount pass + one re-render per increment.
		expect(getRenderCount()).toBe(6);
		r.unmount();
	});
});

describe('useState — unguarded render-phase update', () => {
	it('throws "Too many re-renders" instead of hanging', () => {
		expect(() => mount(UnguardedRenderLoop)).toThrow(/Too many re-renders/);
	});

	it('the loop error is catchable by @try / ErrorBoundary', () => {
		const r = mount(CaughtRenderLoop);
		expect(r.find('#err').textContent).toMatch(/Too many re-renders/);
		r.unmount();
	});
});

describe('useState — initial value is mount-only', () => {
	it('a changed prop passed as the initial value does not re-seed state', () => {
		const r = mount(InitialFromProp, { seed: 1 });
		expect(r.find('#out').textContent).toBe('1');
		r.update(InitialFromProp, { seed: 99 });
		expect(r.find('#out').textContent).toBe('1');
		r.unmount();
	});
});

describe('useState — bailout interactions with effects', () => {
	it('setting the current value skips the render and the [state]-keyed effect', () => {
		const r = mount(SameValueEffectSkip);
		flushEffects();
		expect(getEffectRuns()).toBe(1);

		r.click('#same');
		flushEffects();
		expect(getEffectRuns()).toBe(1);

		r.click('#bump');
		flushEffects();
		expect(getEffectRuns()).toBe(2);
		expect(r.find('#out').textContent).toBe('1');
		r.unmount();
	});

	it('a bailed update does not block a later real update (NaN -> NaN, then NaN -> 1)', () => {
		const r = mount(BailThenChange);
		const renders = getRenderCount();
		r.click('#nan');
		expect(getRenderCount()).toBe(renders);
		r.click('#one');
		expect(getRenderCount()).toBe(renders + 1);
		expect(r.find('#out').textContent).toBe('1');
		r.unmount();
	});
});

describe('useState — updater queue observes pending state', () => {
	it('each chained updater receives the previous updater output, not the committed value', () => {
		const r = mount(UpdaterSeesPending);
		r.click('#chain');
		expect(getUpdaterArgs()).toEqual([0, 1, 2]);
		expect(r.find('#out').textContent).toBe('3');
		r.unmount();
	});

	it('set-then-revert in one handler still renders the body once', () => {
		// Per ReactDOMHooks-test.js — an update scheduled inside an event handler
		// is not eagerly discarded once work is queued; the body runs, the DOM
		// ends unchanged.
		const r = mount(SetThenRevert);
		const renders = getRenderCount();
		r.click('#revert');
		expect(getRenderCount()).toBe(renders + 1);
		expect(r.find('#out').textContent).toBe('0');
		r.unmount();
	});
});

describe('useEffect — closure freshness across a dep-change commit', () => {
	it('cleanup sees the previous render value, setup sees the new one', () => {
		const log = createLog();
		const r = mount(CleanupClosure, { log: log.push });
		flushEffects();
		expect(log.drain()).toEqual(['setup:0']);

		r.click('#inc');
		flushEffects();
		expect(log.drain()).toEqual(['cleanup:0', 'setup:1']);

		r.click('#inc');
		flushEffects();
		expect(log.drain()).toEqual(['cleanup:1', 'setup:2']);

		r.unmount();
		expect(log.drain()).toEqual(['cleanup:2']);
	});
});
