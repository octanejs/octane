import { describe, it, expect } from 'vitest';
import { mount } from '../_helpers';
import { ClassAndStyle, StyledDiv, StyledSpan } from './_fixtures/dom-component-styles.tsrx';

// ============================================================================
// ReactDOMComponent-test.js — style / className update matrix (updateDOM)
// ============================================================================
// Ports drive the SAME element through create → update → clear via
// mount()/update() with prop changes (the analogue of re-rendering the root
// with different JSX props). Full 163-case accounting lives at the bottom of
// dom-component-attributes.test.ts.

describe('ReactDOMComponent — className updates', () => {
	// Per ReactDOMComponent-test.js:42 — should handle className
	it('updates className foo → bar → null', () => {
		const r = mount(ClassAndStyle, { s: {} });
		const el = r.container.firstElementChild as HTMLElement;
		r.update(ClassAndStyle, { cls: 'foo' });
		expect(el.className).toBe('foo');
		r.update(ClassAndStyle, { cls: 'bar' });
		expect(el.className).toBe('bar');
		r.update(ClassAndStyle, { cls: null });
		expect(el.className).toBe('');
		r.unmount();
	});
});

describe('ReactDOMComponent — style value types', () => {
	// Per ReactDOMComponent-test.js:63 — should gracefully handle various style value types
	it('sets px-appended numbers, clears "", null, and false values', () => {
		const r = mount(StyledDiv, { s: {} });
		const style = (r.container.firstElementChild as HTMLElement).style;

		r.update(StyledDiv, { s: { display: 'block', left: '1px', top: 2, fontFamily: 'Arial' } });
		expect(style.display).toBe('block');
		expect(style.left).toBe('1px');
		expect(style.top).toBe('2px'); // bare number → px
		expect(style.fontFamily).toBe('Arial');

		// Reset to defaults: '' clears, null clears, false clears.
		r.update(StyledDiv, { s: { display: '', left: null, top: false, fontFamily: 'Arial' } });
		expect(style.display).toBe('');
		expect(style.left).toBe('');
		expect(style.top).toBe('');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:63 — the `fontFamily: true` arm of the same test.
	// GAP: React treats a boolean style value as '' (dangerousStyleValue drops
	// booleans); octane's applyStyleValue only drops null/false — `true` reaches
	// cssStyleValue and stringifies to the (valid!) font-family "true".
	// Runtime location: applyStyleValue / cssStyleValue (runtime.ts ~3678).
	it('clears a style property set to boolean true', () => {
		const r = mount(StyledDiv, { s: { fontFamily: 'Arial' } });
		const style = (r.container.firstElementChild as HTMLElement).style;
		expect(style.fontFamily).toBe('Arial');
		r.update(StyledDiv, { s: { fontFamily: true } });
		expect(style.fontFamily).toBe('');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:97 — should not update styles when mutating a proxy style object
	it('does not re-apply styles when the style object identity is unchanged', () => {
		const styleStore = { display: 'none', fontFamily: 'Arial', lineHeight: 1.2 };
		const styles = {
			get display() {
				return styleStore.display;
			},
			set display(v: string) {
				styleStore.display = v;
			},
			get fontFamily() {
				return styleStore.fontFamily;
			},
			set fontFamily(v: string) {
				styleStore.fontFamily = v;
			},
			get lineHeight() {
				return styleStore.lineHeight;
			},
			set lineHeight(v: number) {
				styleStore.lineHeight = v;
			},
		};
		const r = mount(StyledDiv, { s: styles });
		const style = (r.container.firstElementChild as HTMLElement).style;
		expect(style.display).toBe('none');

		styleStore.display = 'block';
		r.update(StyledDiv, { s: styles });
		expect(style.display).toBe('none');
		expect(style.fontFamily).toBe('Arial');
		expect(style.lineHeight).toBe('1.2');

		styleStore.fontFamily = 'Helvetica';
		r.update(StyledDiv, { s: styles });
		expect(style.display).toBe('none');
		expect(style.fontFamily).toBe('Arial');
		expect(style.lineHeight).toBe('1.2');

		styleStore.lineHeight = 0.5;
		r.update(StyledDiv, { s: styles });
		expect(style.fontFamily).toBe('Arial');
		expect(style.lineHeight).toBe('1.2');

		// Clearing to undefined wipes everything the object had applied.
		r.update(StyledDiv, { s: undefined });
		expect(style.display).toBe('');
		expect(style.fontFamily).toBe('');
		expect(style.lineHeight).toBe('');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:340 — throws with Temporal-like objects as style values
	it('throws when a style value is a Temporal-like object (valueOf throws)', () => {
		class TemporalLike {
			valueOf() {
				throw new TypeError('prod message');
			}
			toString() {
				return '2020-01-01';
			}
		}
		expect(() => mount(StyledSpan, { s: { fontSize: new TemporalLike() } })).toThrowError(
			new TypeError('prod message'),
		);
	});
});

describe('ReactDOMComponent — style null transitions', () => {
	// Per ReactDOMComponent-test.js:368 — should update styles if initially null
	it('applies styles after an initial null style', () => {
		const r = mount(StyledDiv, { s: null });
		const style = (r.container.firstElementChild as HTMLElement).style;
		r.update(StyledDiv, { s: { display: 'block' } });
		expect(style.display).toBe('block');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:386 — should update styles if updated to null multiple times
	it('round-trips object → null → object → null', () => {
		const r = mount(StyledDiv, { s: null });
		const style = (r.container.firstElementChild as HTMLElement).style;
		const styles = { display: 'block' };

		r.update(StyledDiv, { s: styles });
		expect(style.display).toBe('block');
		r.update(StyledDiv, { s: null });
		expect(style.display).toBe('');
		r.update(StyledDiv, { s: styles });
		expect(style.display).toBe('block');
		r.update(StyledDiv, { s: null });
		expect(style.display).toBe('');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:859 — should clear a single style prop when changing `style`
	it('clears a property missing from the next style object', () => {
		const r = mount(StyledDiv, { s: { display: 'none', color: 'red' } });
		const style = (r.container.firstElementChild as HTMLElement).style;
		r.update(StyledDiv, { s: { color: 'green' } });
		expect(style.display).toBe('');
		expect(style.color).toBe('green');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:1126 — should clear all the styles when removing `style`
	it('clears every property when style goes away', () => {
		const r = mount(StyledDiv, { s: { display: 'none', color: 'red' } });
		const style = (r.container.firstElementChild as HTMLElement).style;
		r.update(StyledDiv, {}); // style prop absent → undefined
		expect(style.display).toBe('');
		expect(style.color).toBe('');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:1143 — should update styles when `style` changes from null to object
	it('re-applies the object after a null round-trip', () => {
		const styles = { color: 'red' };
		const r = mount(StyledDiv, { s: styles });
		const style = (r.container.firstElementChild as HTMLElement).style;
		expect(style.color).toBe('red');
		r.update(StyledDiv, {});
		expect(style.color).toBe('');
		r.update(StyledDiv, { s: styles });
		expect(style.color).toBe('red');
		r.unmount();
	});
});
