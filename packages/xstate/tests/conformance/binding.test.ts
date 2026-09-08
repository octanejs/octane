/**
 * @octanejs/xstate conformance — the ported binding driven against the REAL
 * `xstate@5.32.5` actor core. These assertions cover what the differential rig
 * cannot observe through `innerHTML`: per-call-site hook-slot independence,
 * selector bail-out, and actor start/stop lifecycle.
 */
import { describe, expect, it } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import {
	CountOnly,
	CounterApp,
	CounterContext,
	MixedSiblingsApp,
	SiblingSelectorsApp,
	Toggle,
	UnboundSiblingsApp,
	renderLog,
} from '../_fixtures/conformance.tsrx';

describe('useMachine', () => {
	it('renders the initial state and transitions on send', async () => {
		const r = mount(Toggle);

		expect(r.find('#value').textContent).toBe('inactive');

		r.click('#toggle');
		await nextPaint();
		expect(r.find('#value').textContent).toBe('active');

		r.click('#toggle');
		await nextPaint();
		expect(r.find('#value').textContent).toBe('inactive');

		r.unmount();
	});
});

describe('createActorContext', () => {
	it('gives each member-form useSelector call site its own hook slot', async () => {
		const r = mount(CounterApp);

		expect(r.find('#both-count').textContent).toBe('0');
		expect(r.find('#both-other').textContent).toBe('0');

		r.click('#inc');
		await nextPaint();

		// If the two call sites shared a slot, `other` would follow `count`.
		expect(r.find('#both-count').textContent).toBe('1');
		expect(r.find('#both-other').textContent).toBe('0');

		r.click('#inc-other');
		await nextPaint();

		expect(r.find('#both-count').textContent).toBe('1');
		expect(r.find('#both-other').textContent).toBe('1');

		r.unmount();
	});

	it('throws from a bound hook used outside its Provider', () => {
		expect(() => mount(CountOnly)).toThrow(/ActorProvider/);
	});

	it('keeps the actor running so updates reach every subscriber', async () => {
		const r = mount(SiblingSelectorsApp);

		expect(r.find('#other').textContent).toBe('0');
		expect(r.find('#count').textContent).toBe('0');

		r.click('#inc-other');
		await nextPaint();
		expect(r.find('#other').textContent).toBe('1');
		expect(r.find('#count').textContent).toBe('0');

		r.click('#inc');
		await nextPaint();
		expect(r.find('#count').textContent).toBe('1');

		r.unmount();
	});
});

describe('selector bail-out', () => {
	it('re-renders only the subscriber whose selected value changed', async () => {
		const r = mount(UnboundSiblingsApp);
		renderLog.length = 0;

		r.click('#inc-other');
		await nextPaint();

		// UnboundOther selected `other`; nothing else may re-render.
		expect(renderLog).toEqual(['UnboundOther']);

		r.unmount();
	});

	// The context-bound hooks are reached the way upstream's README and its whole
	// createActorContext suite write them — `SomeContext.useSelector(fn)`. That
	// member-call shape has to isolate exactly like the unbound hook above.
	it('re-renders only the bound subscriber whose selected value changed', async () => {
		const r = mount(SiblingSelectorsApp);
		renderLog.length = 0;

		r.click('#inc-other');
		await nextPaint();

		expect(renderLog).toEqual(['OtherOnly']);

		r.unmount();
	});

	// The same component plus one identifier-form hook. Kept as a control: it
	// isolated even while the member-only form did not, so it distinguishes a
	// binding-level selector regression from a compiler-level boundary one.
	it('isolates a bound subscriber that also calls an identifier-form hook', async () => {
		const r = mount(MixedSiblingsApp);
		renderLog.length = 0;

		r.click('#inc-other');
		await nextPaint();

		expect(renderLog).toEqual(['OtherOnlyWithState:0']);

		r.unmount();
	});
});

describe('exports', () => {
	it('exposes the complete @xstate/react 6.1.0 surface', async () => {
		const mod = await import('@octanejs/xstate');

		expect(Object.keys(mod).sort()).toEqual([
			'createActorContext',
			'shallowEqual',
			'useActor',
			'useActorRef',
			'useMachine',
			'useSelector',
		]);
	});

	it('returns a Provider and both bound hooks from createActorContext', () => {
		expect(typeof CounterContext.Provider).toBe('function');
		expect(typeof CounterContext.useActorRef).toBe('function');
		expect(typeof CounterContext.useSelector).toBe('function');
	});
});
