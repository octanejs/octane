/**
 * P0-hooks: prove the withSlot call-path model resolves custom-hook reuse with NO
 * slot plumbing in the custom hook. A custom hook called TWICE gives independent
 * state — the two call sites push different symbols, so the inner useState keys differ.
 */
import { describe, it, expect } from 'vitest';
import { createElement, useState, withSlot, flushSync, template, clone } from 'octane';
import { mount } from './_helpers';

// A custom hook with ZERO slot code — its inner base hook is just withSlot-wrapped.
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
function TwoCounters(props: any, _block: any): any {
	const [an, ainc] = withSlot(Symbol.for('t:TwoCounters.useCounter#0'), useCounter);
	const [bn, binc] = withSlot(Symbol.for('t:TwoCounters.useCounter#1'), useCounter);
	props.onReady({ an, ainc, bn, binc });
	return createElement(Shell, {});
}

describe('P0-hooks: withSlot custom-hook reuse', () => {
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
