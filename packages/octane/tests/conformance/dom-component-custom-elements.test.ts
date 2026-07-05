import { describe, it, expect } from 'vitest';
import { mount } from '../_helpers';
import {
	SlotProjection,
	CustomSpread,
	CustomUnfiltered,
	CustomBoolAttr,
	IsCustomDiv,
} from './_fixtures/dom-component-custom-elements.tsrx';

// ============================================================================
// ReactDOMComponent-test.js — custom elements / web components
// ============================================================================
// React 19 semantics on custom elements: nothing is filtered or aliased,
// reserved React props never hit the DOM, booleans reflect as ''/removed.

const first = (r: { container: HTMLElement }) => r.container.firstElementChild as HTMLElement;

describe('ReactDOMComponent — web components', () => {
	// Per ReactDOMComponent-test.js:418 — should allow named slot projection on both web components and regular DOM elements
	it('projects slot attributes onto web-component and regular children', () => {
		const r = mount(SlotProjection);
		const lightDOM = first(r).childNodes;
		expect((lightDOM[0] as Element).getAttribute('slot')).toBe('first');
		expect((lightDOM[1] as Element).getAttribute('slot')).toBe('second');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:437 — should skip reserved props on web components
	// (children + suppressHydrationWarning arms — both are JS-only in octane too)
	it('never writes children/suppressHydrationWarning as attributes', () => {
		const r = mount(CustomSpread, {
			sp: { children: ['foo'], suppressHydrationWarning: true },
		});
		const node = first(r);
		expect(node.hasAttribute('children')).toBe(false);
		expect(node.hasAttribute('suppressHydrationWarning')).toBe(false);
		r.update(CustomSpread, {
			sp: { children: ['bar'], suppressHydrationWarning: false },
		});
		expect(node.hasAttribute('children')).toBe(false);
		expect(node.hasAttribute('suppressHydrationWarning')).toBe(false);
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:437 — the suppressContentEditableWarning arm.
	// GAP: React skips `suppressContentEditableWarning` on every element; octane
	// has no contentEditable warning and treats the key as a plain attribute —
	// setSpread writes `suppresscontenteditablewarning=""` into the DOM.
	// Runtime location: setSpread (runtime.ts:3819) — the reserved-key skip list
	// covers key/children/ref/suppressHydrationWarning only.
	it('never writes suppressContentEditableWarning as an attribute', () => {
		const r = mount(CustomSpread, { sp: { suppressContentEditableWarning: true } });
		expect(first(r).hasAttribute('suppressContentEditableWarning')).toBe(false);
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:476 — should skip dangerouslySetInnerHTML on web components
	// (octane routes it to el.innerHTML — a PROPERTY — so, like React, no
	// attribute ever appears in the DOM; unlike React the HTML is applied.)
	it('never writes dangerouslySetInnerHTML as an attribute', () => {
		const r = mount(CustomSpread, { sp: { dangerouslySetInnerHTML: { __html: 'hi' } } });
		expect(first(r).hasAttribute('dangerouslySetInnerHTML')).toBe(false);
		r.update(CustomSpread, { sp: { dangerouslySetInnerHTML: { __html: 'bye' } } });
		expect(first(r).hasAttribute('dangerouslySetInnerHTML')).toBe(false);
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:705 — should not filter attributes for custom elements
	it('keeps action/formAction/href/src on a custom element', () => {
		const r = mount(CustomUnfiltered);
		const node = first(r);
		expect(node.hasAttribute('action')).toBe(true);
		expect(node.hasAttribute('formAction')).toBe(true);
		expect(node.hasAttribute('href')).toBe(true);
		expect(node.hasAttribute('src')).toBe(true);
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:816 — should properly update custom attributes on custom elements
	it('swaps one custom attribute for another across renders', () => {
		const r = mount(CustomSpread, { sp: { foo: 'bar' } });
		const node = first(r);
		expect(node.getAttribute('foo')).toBe('bar');
		r.update(CustomSpread, { sp: { bar: 'buzz' } });
		expect(node.hasAttribute('foo')).toBe(false);
		expect(node.getAttribute('bar')).toBe('buzz');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:833 — should not apply React-specific aliases to custom elements
	it('leaves camelCase names un-aliased on custom elements', () => {
		const r = mount(CustomSpread, { sp: { arabicForm: 'foo' } });
		const node = first(r);
		expect(node.getAttribute('arabicForm')).toBe('foo');
		expect(node.hasAttribute('arabic-form')).toBe(false);
		r.update(CustomSpread, { sp: { arabicForm: 'boo' } });
		expect(node.getAttribute('arabicForm')).toBe('boo');
		r.update(CustomSpread, { sp: { acceptCharset: 'buzz' } });
		expect(node.hasAttribute('arabicForm')).toBe(false);
		expect(node.getAttribute('acceptCharset')).toBe('buzz');
		expect(node.hasAttribute('accept-charset')).toBe(false);
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:1109 — should update arbitrary attributes for tags containing dashes
	it('adds an arbitrary attribute on update to a dashed tag', () => {
		const r = mount(CustomSpread, { sp: {} });
		r.update(CustomSpread, { sp: { myattr: 'myval' } });
		expect(first(r).getAttribute('myattr')).toBe('myval');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:3701 — does not strip unknown boolean attributes
	it('reflects boolean attribute values: true → "", false → removed', () => {
		const r = mount(CustomBoolAttr, { foo: true });
		const node = first(r);
		expect(node.getAttribute('foo')).toBe('');
		r.update(CustomBoolAttr, { foo: false });
		expect(node.getAttribute('foo')).toBe(null);
		r.update(CustomBoolAttr, {});
		expect(node.hasAttribute('foo')).toBe(false);
		r.update(CustomBoolAttr, { foo: true });
		expect(node.hasAttribute('foo')).toBe(true);
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:3723 — does not strip the on* attributes
	// (lowercase `onx` is NOT an event key — React and octane both keep it as an attribute)
	it('keeps lowercase on* string attributes', () => {
		const r = mount(CustomSpread, { sp: { onx: 'bar' } });
		const node = first(r);
		expect(node.getAttribute('onx')).toBe('bar');
		r.update(CustomSpread, { sp: { onx: 'buzz' } });
		expect(node.getAttribute('onx')).toBe('buzz');
		r.update(CustomSpread, { sp: {} });
		expect(node.hasAttribute('onx')).toBe(false);
		r.update(CustomSpread, { sp: { onx: 'bar' } });
		expect(node.getAttribute('onx')).toBe('bar');
		r.unmount();
	});
});

describe('ReactDOMComponent — customized built-ins (is=)', () => {
	// Per ReactDOMComponent-test.js:1951 — should support custom elements which extend native elements
	// OUTCOME-level port: React passes {is} to document.createElement; octane
	// clones a template parsed from HTML markup, so the `is` attribute is present
	// but the createElement(tag, {is}) upgrade path is not exercised. (Customized
	// built-in UPGRADE registration therefore may not fire in real browsers.)
	it('renders the is attribute on the built-in element', () => {
		const r = mount(IsCustomDiv, { cls: 'x' });
		expect(first(r).getAttribute('is')).toBe('custom-div');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:3189 — sets aliased attributes on custom elements
	// Per ReactDOMComponent-test.js:3213 — updates aliased attributes on custom elements
	// (`class` is octane's NATIVE spelling — no alias needed; warning-text skipped)
	it('sets and updates class on an is= element', () => {
		const r = mount(IsCustomDiv, { cls: 'test' });
		const node = first(r);
		expect(node.getAttribute('class')).toBe('test');
		r.update(IsCustomDiv, { cls: 'bar' });
		expect(node.getAttribute('class')).toBe('bar');
		r.unmount();
	});
});
