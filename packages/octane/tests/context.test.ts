import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import {
	DynamicProvider,
	CombinedDynamic,
	BareReader,
	RemountingProvider,
	Siblings,
	TwoContexts,
	ConditionalUse,
	ListConsumers,
	PortalledContext,
	LiveCount,
	StableChildren,
} from './_fixtures/context.tsrx';

describe('context — value updates', () => {
	it('consumers re-render when Provider value changes', () => {
		const r = mount(DynamicProvider);
		expect(r.find('.theme').textContent).toBe('init');
		r.click('#swap');
		expect(r.find('.theme').textContent).toBe('changed');
		r.click('#swap');
		expect(r.find('.theme').textContent).toBe('init');
		r.unmount();
	});

	it('consumers below an identity-stable {children} passthrough see the new value', () => {
		// The Provider re-renders with a new value while its `{props.children}`
		// hole receives the SAME children block each pass — the compiled hole
		// must still hand the unchanged renderable to childSlot so the consumer
		// below refreshes (an inline identity skip strands it on the old value).
		const r = mount(StableChildren);
		expect(r.find('.theme').textContent).toBe('init');
		r.click('#swap');
		expect(r.find('.theme').textContent).toBe('changed');
		r.click('#swap');
		expect(r.find('.theme').textContent).toBe('init');
		r.unmount();
	});
});

describe('context — multiple consumers', () => {
	it('all sibling consumers read the same Provider value', () => {
		const r = mount(Siblings);
		expect(r.findAll('.theme').map((el) => el.textContent)).toEqual(['dark', 'dark', 'dark']);
		r.unmount();
	});

	it('distinct contexts do not leak into each other', () => {
		const r = mount(TwoContexts);
		expect(r.find('.theme').textContent).toBe('dark');
		expect(r.find('.user').textContent).toBe('alice');
		expect(r.find('.combined').textContent).toBe('dark/alice');
		r.unmount();
	});

	it('a consumer of two contexts reads both live after a re-render', () => {
		// Multi-entry resolved-provider cache: re-rendering with one Provider
		// changed must yield the new value for that context AND the unchanged
		// value for the other.
		const r = mount(CombinedDynamic);
		expect(r.find('.combined').textContent).toBe('t0/alice');
		r.click('#bump');
		expect(r.find('.combined').textContent).toBe('t1/alice');
		r.click('#bump');
		expect(r.find('.combined').textContent).toBe('t0/alice');
		r.unmount();
	});
});

describe('context — provider remount', () => {
	it('a consumer reads the fresh value when its Provider is torn down and rebuilt', () => {
		// The Provider's scope is destroyed on `show: false` and a brand-new one
		// (with a different value) is built on the next `show: true`. The consumer
		// must read the current value each time — never one cached from a prior
		// mount. Guards the invariant the cache relies on after dropping its
		// defensive resolver recheck.
		const r = mount(RemountingProvider, { show: true, value: 1 });
		expect(r.find('.count').textContent).toBe('1');
		r.update(RemountingProvider, { show: false, value: 1 });
		expect(r.find('.off').textContent).toBe('off');
		r.update(RemountingProvider, { show: true, value: 2 });
		expect(r.find('.count').textContent).toBe('2');
		r.update(RemountingProvider, { show: false, value: 2 });
		r.update(RemountingProvider, { show: true, value: 3 });
		expect(r.find('.count').textContent).toBe('3');
		r.unmount();
	});
});

describe('context — no Provider (default)', () => {
	it('a provider-less consumer keeps reading the default across re-renders', () => {
		// Exercises the resolved-provider cache's "cached default" path: the first
		// read records "no provider", and re-renders must keep returning the
		// context default rather than a stale or wrong value.
		const r = mount(BareReader, { tick: 0 });
		expect(r.find('.bare').textContent).toBe('0:0');
		r.update(BareReader, { tick: 1 });
		expect(r.find('.bare').textContent).toBe('0:1');
		r.update(BareReader, { tick: 2 });
		expect(r.find('.bare').textContent).toBe('0:2');
		r.unmount();
	});
});

describe('context — inside control flow', () => {
	it('use() inside an if-branch reads the active Provider', () => {
		const r = mount(ConditionalUse, { show: true });
		expect(r.find('.theme').textContent).toBe('dark');
		r.update(ConditionalUse, { show: false });
		expect(r.findAll('.theme')).toHaveLength(0);
		expect(r.find('.hidden').textContent).toBe('hidden');
		r.update(ConditionalUse, { show: true });
		expect(r.find('.theme').textContent).toBe('dark');
		r.unmount();
	});

	it('use() inside for-of items reads the active Provider per item', () => {
		const r = mount(ListConsumers, { items: [1, 2, 3], value: 42 });
		expect(r.findAll('.count').map((el) => el.textContent)).toEqual(['42', '42', '42']);
		r.unmount();
	});

	it('Provider value updates flow to all for-of consumers', () => {
		const r = mount(LiveCount, { ids: ['a', 'b', 'c'] });
		expect(r.findAll('.count').map((el) => el.textContent)).toEqual(['0', '0', '0']);
		r.click('#inc');
		expect(r.findAll('.count').map((el) => el.textContent)).toEqual(['1', '1', '1']);
		r.click('#inc');
		r.click('#inc');
		expect(r.findAll('.count').map((el) => el.textContent)).toEqual(['3', '3', '3']);
		r.unmount();
	});
});

describe('context — through portals', () => {
	it('Provider wraps a portal — portal-target consumers see the value', () => {
		const target = document.createElement('aside');
		document.body.appendChild(target);
		const r = mount(PortalledContext, { target });
		// Portal content lives in `target`, NOT in the app container.
		expect(r.findAll('.portal-content')).toHaveLength(0);
		expect(target.querySelector('.portal-content')).not.toBe(null);
		// And the consumer inside the portal sees the outer Provider's value.
		expect(target.querySelector('.theme')!.textContent).toBe('from-portal-parent');
		r.unmount();
		target.remove();
	});
});
