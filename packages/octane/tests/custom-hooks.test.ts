import { describe, it, expect } from 'vitest';
import { createElement, useState, withSlot, flushSync, template, clone } from 'octane';
import { mount } from './_helpers';
import { ReuseApp, NestedApp } from './_fixtures/custom-hooks.tsrx';

// "Hooks everywhere": Octane base hooks are slotted in ANY function, and custom
// (`use[A-Z]`) hook calls are wrapped in withSlot so reuse stays independent.
describe('custom hooks', () => {
	it('a custom hook with multiple base hooks works (single use)', () => {
		const r = mount(NestedApp as any);
		expect(r.find('.n').textContent).toBe('x:5');
		r.click('.n');
		expect(r.find('.n').textContent).toBe('x:6'); // nested custom hook composes
		r.unmount();
	});

	it('the same custom hook reused at two call sites keeps independent state', () => {
		const r = mount(ReuseApp as any);
		expect(r.find('.a').textContent).toBe('0');
		expect(r.find('.b').textContent).toBe('100');
		expect(r.find('.ta').textContent).toBe('n');

		r.click('.a'); // only a's counter (and its second base hook) advances
		expect(r.find('.a').textContent).toBe('1');
		expect(r.find('.b').textContent).toBe('100'); // b untouched
		expect(r.find('.ta').textContent).toBe('y'); // a's 2nd base hook updated

		r.click('.b');
		expect(r.find('.a').textContent).toBe('1');
		expect(r.find('.b').textContent).toBe('101');
		r.unmount();
	});
});

// The same reuse contract with NO compiler involved: withSlot is a public runtime
// API, so a hand-written custom hook (its inner base hook invoked THROUGH withSlot
// with a stable symbol, no trailing-slot plumbing) must resolve independent state
// per call site exactly like the compiled emission above.
describe('manual withSlot (hand-written, no compiler)', () => {
	function useCounter(): [number, () => void] {
		const [n, setN] = withSlot(Symbol.for('t:useCounter.useState#0'), useState, 0);
		return [n, () => setN(n + 1)];
	}
	const _div = template('<div></div>');
	function Shell(_p: any, __s: any) {
		const __block = __s.block;
		if (__s.b$0 === undefined) {
			__s.b$0 = {};
			__block.parentNode.insertBefore(clone(_div), __block.endMarker);
		}
	}
	// Calls the SAME custom hook twice — different call-site symbols → independent state.
	function TwoCounters(props: any): any {
		const [an, ainc] = withSlot(Symbol.for('t:TwoCounters.useCounter#0'), useCounter);
		const [bn, binc] = withSlot(Symbol.for('t:TwoCounters.useCounter#1'), useCounter);
		props.onReady({ an, ainc, bn, binc });
		return createElement(Shell, {});
	}

	it('a custom hook called twice has INDEPENDENT state (no collision, no plumbing)', () => {
		let api: any;
		const r = mount(TwoCounters as any, { onReady: (x: any) => (api = x) });
		expect(api.an).toBe(0);
		expect(api.bn).toBe(0);

		flushSync(() => api.ainc()); // bump A only

		expect(api.an).toBe(1); // A advanced
		expect(api.bn).toBe(0); // B untouched → distinct call-path slots
		r.unmount();
	});
});
