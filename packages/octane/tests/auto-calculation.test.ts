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
import {
	callTsxCallableProjection,
	TsxDerivedIdentity,
	TsxLiveReceiverCalculation,
	TsxUnstablePrefixedHook,
} from './_fixtures/tsx-auto-memo.tsx';

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

describe('auto-calculation — React-style return components', () => {
	it('preserves derived identity across unrelated updates and invalidates changed inputs', () => {
		const root = mount(TsxDerivedIdentity);
		const first = root.find('#tsx-derived-identity').textContent;
		expect(root.find('#tsx-derived-values').textContent).toBe('r1:1');

		root.click('#tsx-derived-tick');
		expect(root.find('#tsx-derived-identity').textContent).toBe(first);

		root.click('#tsx-derived-add');
		const second = root.find('#tsx-derived-identity').textContent;
		expect(second).not.toBe(first);
		expect(root.find('#tsx-derived-values').textContent).toBe('r1:1,r2:2');

		root.click('#tsx-derived-tick');
		expect(root.find('#tsx-derived-identity').textContent).toBe(second);
		root.unmount();
	});

	it('keeps a live method-backed calculation reactive', () => {
		const root = mount(TsxLiveReceiverCalculation);
		const first = root.find('#tsx-receiver-value').textContent;

		root.click('#tsx-receiver-tick');
		const second = root.find('#tsx-receiver-value').textContent;
		expect(second).not.toBe(first);

		root.click('#tsx-receiver-tick');
		expect(root.find('#tsx-receiver-value').textContent).not.toBe(second);
		root.unmount();
	});

	it('keeps an imported uppercase UNSTABLE_ custom hook live after a built-in hook', () => {
		const root = mount(TsxUnstablePrefixedHook);
		expect(root.find('#tsx-unstable-hook-value').textContent).toBe('0');

		root.click('#tsx-unstable-hook-increment');
		expect(root.find('#tsx-unstable-hook-value').textContent).toBe('1');

		root.click('#tsx-unstable-hook-tick');
		expect(root.find('#tsx-unstable-hook-value').textContent).toBe('1');

		root.click('#tsx-unstable-hook-increment');
		expect(root.find('#tsx-unstable-hook-value').textContent).toBe('2');
		root.unmount();
	});

	it('keeps hookless return components callable outside a render scope', () => {
		const rows = [{ id: 1, n: 1 }];
		expect(() => callTsxCallableProjection({ rows })).not.toThrow();

		const root = mount(callTsxCallableProjection, { rows });
		expect(root.find('#tsx-callable-values').textContent).toBe('r1:1');
		root.unmount();
	});
});
