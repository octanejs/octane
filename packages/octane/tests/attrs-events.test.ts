import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import {
	Classed,
	WithAttrs,
	Clicker,
	DoubleClicker,
	FnSetter,
	SpreadDoubleClicker,
	AriaStaticLiterals,
} from './_fixtures/attrs-events.tsrx';

describe('attributes', () => {
	it('binds dynamic class', () => {
		const r = mount(Classed, { kind: 'red' });
		expect(r.find('div').className).toBe('red');
		r.unmount();
	});

	it('binds dynamic attributes', () => {
		const r = mount(WithAttrs, { url: 'https://x', title: 'hi' });
		const a = r.find('a') as HTMLAnchorElement;
		expect(a.getAttribute('href')).toBe('https://x');
		expect(a.getAttribute('title')).toBe('hi');
		r.unmount();
	});

	it('bakes static aria-* boolean literals as enumerated "true"/"false"', () => {
		// React parity: `aria-hidden={false}` renders `aria-hidden="false"` (it
		// must NOT drop), `aria-expanded={true}` renders "true" (not a bare
		// attribute) — matching the runtime setAttribute/ssrAttr dynamic path.
		// A non-aria boolean literal keeps the generic handling (false drops).
		const r = mount(AriaStaticLiterals);
		const host = r.find('#aria-host');
		expect(host.getAttribute('aria-hidden')).toBe('false');
		expect(host.getAttribute('aria-expanded')).toBe('true');
		expect(host.getAttribute('aria-label')).toBe('lbl');
		expect(host.hasAttribute('hidden')).toBe(false);
		r.unmount();
	});
});

describe('events + useState', () => {
	it('increments on click', () => {
		const r = mount(Clicker);
		expect(r.find('button').textContent).toBe('0');
		r.click('button');
		expect(r.find('button').textContent).toBe('1');
		r.click('button');
		r.click('button');
		expect(r.find('button').textContent).toBe('3');
		r.unmount();
	});

	it('functional setters chain via flushSync', () => {
		const r = mount(FnSetter);
		r.click('button');
		expect(r.find('button').textContent).toBe('3'); // 3 functional setters in one click
		r.unmount();
	});

	it('maps onDoubleClick to the native dblclick event', () => {
		const r = mount(DoubleClicker);
		r.find('button').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
		expect(r.find('button').textContent).toBe('1');
		r.unmount();
	});

	it('maps spread onDoubleClick to the native dblclick event', () => {
		const r = mount(SpreadDoubleClicker);
		r.find('button').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
		expect(r.find('button').textContent).toBe('1');
		r.unmount();
	});
});
