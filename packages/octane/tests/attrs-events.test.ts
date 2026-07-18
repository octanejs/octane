import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';
import { mount } from './_helpers';
import {
	Classed,
	WithAttrs,
	StringDataAttribute,
	RuntimeTypedDataAttribute,
	DynamicAriaAttribute,
	Clicker,
	DoubleClicker,
	FnSetter,
	SpreadDoubleClicker,
	EventAfterSpread,
	DuplicateEventWriters,
	ReassignedEventHandler,
	ShadowedHookFactory,
	RegexCallbackDependency,
	RegexEventArgument,
	StableNativeEventCallbacks,
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

	it('updates a string-valued data attribute', () => {
		const r = mount(StringDataAttribute, { value: 'first' });
		const el = r.find('#string-data');
		expect(el.getAttribute('data-label')).toBe('first');
		r.update(StringDataAttribute, { value: 'second' });
		expect(el.getAttribute('data-label')).toBe('second');
		expect(r.find('#string-data')).toBe(el);
		r.unmount();
	});

	it('preserves data attribute coercion when a typed string differs at runtime', () => {
		const r = mount(RuntimeTypedDataAttribute, { value: 'text' });
		const el = r.find('#runtime-data');
		const values: Array<[unknown, string | null]> = [
			['next', 'next'],
			[null, null],
			[undefined, null],
			[() => 'ignored', null],
			[Symbol('ignored'), null],
			[false, 'false'],
			[true, 'true'],
			[0, '0'],
			[{ toString: () => 'object-value' }, 'object-value'],
		];
		for (const [value, expected] of values) {
			r.update(RuntimeTypedDataAttribute, { value });
			expect(el.getAttribute('data-label')).toBe(expected);
			expect(r.find('#runtime-data')).toBe(el);
		}
		r.unmount();
	});

	it('preserves enumerated ARIA coercion on the narrow attribute path', () => {
		const r = mount(DynamicAriaAttribute, { value: 'label' });
		const el = r.find('#dynamic-aria');
		const values: unknown[] = [false, true, 0, () => 'function', Symbol('symbol'), ['a', 'b']];
		for (const value of values) {
			r.update(DynamicAriaAttribute, { value });
			expect(el.getAttribute('aria-label')).toBe(String(value));
			expect(r.find('#dynamic-aria')).toBe(el);
		}
		for (const value of [null, undefined]) {
			r.update(DynamicAriaAttribute, { value });
			expect(el.getAttribute('aria-label')).toBeNull();
		}
		r.unmount();
	});

	it('specializes only safe data attributes whose values are proven strings', () => {
		const specialized = compile(
			`export function C(p) @{ <div data-key={'' + p.id} /> }`,
			'data-string.tsrx',
			{ dev: false },
		).code;
		expect(specialized).toContain('setStringData');
		expect(specialized).not.toContain('setAttribute');

		const generic = compile(
			`export function C(p) @{ <div data-key={p.id} aria-label={'' + p.id} /> }`,
			'data-generic.tsrx',
			{ dev: false },
		).code;
		expect(generic).toContain('setAttribute');
		expect(generic).not.toContain('setStringData');

		const narrow = compile(
			`export function C(p) @{ <button disabled={p.disabled} aria-label={p.label} /> }`,
			'attributes-narrow.tsrx',
			{ dev: false },
		).code;
		expect(narrow).toContain('setBooleanAttribute');
		expect(narrow).toContain('setAriaAttribute');
		expect(narrow).not.toContain('setAttribute');
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

	it('preserves event source order when a spread updates', () => {
		const r = mount(EventAfterSpread);
		r.click('button');
		r.click('button');
		expect(r.find('button').textContent).toBe('2');
		r.unmount();
	});

	it('preserves source order for duplicate event writers', () => {
		const r = mount(DuplicateEventWriters);
		r.click('button');
		r.click('button');
		expect(r.find('button').textContent).toBe('2');
		r.unmount();
	});

	it('uses the latest reassigned event handler', () => {
		const r = mount(ReassignedEventHandler);
		r.click('button');
		r.click('button');
		expect(r.find('button').textContent).toBe('11');
		r.unmount();
	});

	it('refreshes an event handler returned through a hook-like local factory', () => {
		const r = mount(ShadowedHookFactory);
		r.click('#shadowed-hook');
		r.click('#shadowed-hook');
		expect(r.find('#shadowed-hook').textContent).toBe('2');
		r.unmount();
	});

	it('refreshes callbacks with object-valued literal dependencies', () => {
		const r = mount(RegexCallbackDependency);
		r.click('button');
		r.click('button');
		expect(r.find('button').textContent).toBe('2');
		r.unmount();
	});

	it('refreshes object-valued event arguments', () => {
		const r = mount(RegexEventArgument);
		r.click('button');
		r.click('button');
		expect(r.find('button').textContent).toBe('2');
		r.unmount();
	});

	it('keeps stable native handlers live across renders and event sites', () => {
		const observed: Array<() => void> = [];
		const r = mount(StableNativeEventCallbacks, {
			observe: (callback: () => void) => observed.push(callback),
		});
		r.click('#increment');
		r.click('#increment');
		r.click('#add-ten-a');
		r.click('#add-ten-b');
		expect(r.find('output').textContent).toBe('22');
		// A callback observed outside a native event slot retains the public
		// useCallback identity contract across the renders above.
		for (const callback of observed) expect(callback).toBe(observed[0]);
		r.click('#observed');
		expect(r.find('output').textContent).toBe('122');
		r.unmount();
	});
});
