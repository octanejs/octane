import { describe, it, expect } from 'vitest';
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
