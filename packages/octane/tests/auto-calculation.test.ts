import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from './_helpers';
import {
	DerivedIdentity,
	DerivedValue,
	HookCallDeclarations,
	ReassignedLocal,
	HandlerOnlyCalculation,
	LiveReceiverCalculation,
	resetIdentities,
} from './_fixtures/auto-calculation.tsrx';

// A derived `const` whose initializer reaches a render-time call is cached on
// its component-local inputs. The observable contract is identity stability —
// downstream consumers keyed on that identity (an autoMemo region's dependency
// tuple, a memo() child's prop) can only bail if it holds — and, of course,
// that the cached value is still correct.
//
// The cache is a production-compile lowering, so `octane-prod` exercises the
// inline flat-cache branch while `octane` exercises the runtime hook form.
// Identical expectations across both projects is the semantic-equivalence
// proof, which is why these are behavioral assertions rather than codegen ones.

beforeEach(() => {
	resetIdentities();
});

describe('auto-calculation — identity is stable while inputs are', () => {
	it('reuses a derived array across an unrelated re-render', () => {
		const r = mount(DerivedIdentity);
		const first = r.find('#di-identity').textContent;
		expect(r.find('#di-count').textContent).toBe('1');

		// Unrelated state moves; `items` does not.
		r.click('#di-tick');
		expect(r.find('#di-tickval').textContent).toBe('1');
		expect(r.find('#di-identity').textContent).toBe(first);

		r.click('#di-tick');
		expect(r.find('#di-tickval').textContent).toBe('2');
		expect(r.find('#di-identity').textContent).toBe(first);
		r.unmount();
	});

	it('rebuilds the derived array when its input changes', () => {
		const r = mount(DerivedIdentity);
		const first = r.find('#di-identity').textContent;

		r.click('#di-add');
		const second = r.find('#di-identity').textContent;
		expect(second).not.toBe(first);
		expect(r.find('#di-count').textContent).toBe('2');

		// …and holds the new identity across the next unrelated render.
		r.click('#di-tick');
		expect(r.find('#di-identity').textContent).toBe(second);
		expect(r.find('#di-count').textContent).toBe('2');
		r.unmount();
	});
});

describe('auto-calculation — cached values stay correct', () => {
	it('recomputes a reduction and an imported projection when rows change', () => {
		const r = mount(DerivedValue);
		expect(r.find('#dv-total').textContent).toBe('3');
		expect(r.find('#dv-labels').textContent).toBe('r1:1,r2:2');

		// Unrelated re-render: values unchanged.
		r.click('#dv-tick');
		expect(r.find('#dv-tickval').textContent).toBe('1');
		expect(r.find('#dv-total').textContent).toBe('3');
		expect(r.find('#dv-labels').textContent).toBe('r1:1,r2:2');

		// Real input change reaches both derived values, repeatedly.
		r.click('#dv-bump');
		expect(r.find('#dv-total').textContent).toBe('13');
		expect(r.find('#dv-labels').textContent).toBe('r1:11,r2:2');
		r.click('#dv-bump');
		expect(r.find('#dv-total').textContent).toBe('23');
		expect(r.find('#dv-labels').textContent).toBe('r1:21,r2:2');
		r.unmount();
	});
});

describe('auto-calculation — hook calls are never cached', () => {
	// A cache around a hook call freezes its state cell and any subscription it
	// owns — a far worse failure than a stale value. Both declarations below are
	// syntactically indistinguishable from an ordinary creation; only the naming
	// convention marks them as hooks.
	it('keeps a custom hook declaration live', () => {
		const r = mount(HookCallDeclarations);
		expect(r.find('#hc-count').textContent).toBe('0');

		r.click('#hc-bump');
		expect(r.find('#hc-count').textContent).toBe('1');

		// An unrelated re-render must not resurrect a stale cell either.
		r.click('#hc-tick');
		expect(r.find('#hc-count').textContent).toBe('1');
		r.click('#hc-bump');
		expect(r.find('#hc-count').textContent).toBe('2');
		r.unmount();
	});

	it('keeps an `unstable_`-prefixed hook declaration live', () => {
		// React's staging prefix, mirrored by bindings — @octanejs/remix-router
		// ships `unstable_useRouterState`, and caching it froze the router's
		// pending navigation state at "(idle)".
		const r = mount(HookCallDeclarations);
		expect(r.find('#hc-label-value').textContent).toBe('a');

		r.click('#hc-label');
		expect(r.find('#hc-label-value').textContent).toBe('b');

		r.click('#hc-tick');
		expect(r.find('#hc-label-value').textContent).toBe('b');
		r.unmount();
	});
});

describe('auto-calculation — shapes that must keep recomputing', () => {
	it('leaves a reassigned local alone', () => {
		// Caching a `let`'s initializer would drop the reassignment below it.
		const r = mount(ReassignedLocal);
		expect(r.find('#rl-label').textContent).toBe('[base]');

		r.click('#rl-tick');
		expect(r.find('#rl-label').textContent).toBe('[changed]');
		r.unmount();
	});

	it('keeps a handler-only calculation correct as its inputs grow', () => {
		const r = mount(HandlerOnlyCalculation);
		r.click('#ho-read');
		expect(r.find('#ho-seen').textContent).toBe('r1:1');

		r.click('#ho-bump');
		r.click('#ho-read');
		expect(r.find('#ho-seen').textContent).toBe('r1:1|r2:2');
		r.unmount();
	});
});

describe('auto-calculation — a member call on a live receiver is never cached', () => {
	it('re-reads a stable receiver whose method answer changes', () => {
		// A cache keyed on the receiver's identity would freeze this reading, which
		// is how caching `virtualizer.getVirtualItems()` froze a virtualized list
		// mid-scroll. The receiver carries the hazard, so the author naming the
		// result does not make it safe.
		const r = mount(LiveReceiverCalculation);
		const first = r.find('#lr-reading').textContent;

		r.click('#lr-tick');
		expect(r.find('#lr-tickval').textContent).toBe('1');
		expect(r.find('#lr-reading').textContent).not.toBe(first);

		const second = r.find('#lr-reading').textContent;
		r.click('#lr-tick');
		expect(r.find('#lr-reading').textContent).not.toBe(second);
		r.unmount();
	});
});
