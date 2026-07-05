import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';
import { mount } from '../_helpers';
import { DangerValue, TextHole, PlainDiv } from './_fixtures/dom-component-children.tsrx';
import {
	DeoptContent,
	NestedDeoptContent,
	MalformedDanger,
	ChildrenPlusDanger,
	VoidDeoptDanger,
	BadTag,
} from './_fixtures/dom-component-children.tsx';

// ============================================================================
// ReactDOMComponent-test.js — dangerouslySetInnerHTML + children transitions
// ============================================================================
// The string↔innerHTML↔element transition ports use the de-opt (createElement
// descriptor) fixtures: octane's compiled templates can't change prop shape on
// one element, but reconcileDeoptNode/patchDeoptProps patches a reused element
// in place — the analogue of React's updateComponent path.

const first = (r: { container: HTMLElement }) => r.container.firstElementChild as HTMLElement;

describe('ReactDOMComponent — dangerouslySetInnerHTML value matrix', () => {
	// Per ReactDOMComponent-test.js:495 — should render null and undefined as empty but print other falsy values
	it('renders null/undefined as empty but prints 0 and false', () => {
		const r = mount(DangerValue, { h: 'textContent' });
		expect(r.container.textContent).toBe('textContent');
		r.update(DangerValue, { h: 0 });
		expect(r.container.textContent).toBe('0');
		r.update(DangerValue, { h: false });
		expect(r.container.textContent).toBe('false');
		r.update(DangerValue, { h: '' });
		expect(r.container.textContent).toBe('');
		r.update(DangerValue, { h: null });
		expect(r.container.textContent).toBe('');
		r.update(DangerValue, { h: undefined });
		expect(r.container.textContent).toBe('');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:1897 — should allow {__html: null}
	it('allows __html: null', () => {
		expect(() => {
			const r = mount(DangerValue, { h: null });
			expect(r.container.textContent).toBe('');
			r.unmount();
		}).not.toThrow();
	});

	// Per ReactDOMComponent-test.js:3341 — allows Temporal-like objects as HTML
	// (dangerouslySetInnerHTML stringifies via toString, never valueOf)
	it('stringifies a Temporal-like __html via toString (no valueOf coercion)', () => {
		class TemporalLike {
			valueOf() {
				throw new TypeError('prod message');
			}
			toString() {
				return '2020-01-01';
			}
		}
		const r = mount(DangerValue, { h: new TemporalLike() });
		expect(first(r).innerHTML).toBe('2020-01-01');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:3103 — renders innerHTML and preserves whitespace
	it('preserves whitespace in raw HTML', () => {
		const html = '\n  \t  <span>  \n  testContent  \t  </span>  \n  \t';
		const r = mount(DangerValue, { h: html });
		expect(first(r).innerHTML).toBe(html);
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:3116 — render and then updates innerHTML and preserves whitespace
	it('preserves whitespace across a raw-HTML update', () => {
		const html1 = '\n  \t  <span>  \n  testContent1  \t  </span>  \n  \t';
		const html2 = '\n  \t  <div>  \n  testContent2  \t  </div>  \n  \t';
		const r = mount(DangerValue, { h: html1 });
		r.update(DangerValue, { h: html2 });
		expect(first(r).innerHTML).toBe(html2);
		r.unmount();
	});
});

describe('ReactDOMComponent — children ↔ innerHTML transitions', () => {
	// Per ReactDOMComponent-test.js:1163 — should not reset innerHTML for when children is null
	it('leaves manually-set innerHTML alone when the element renders no children', () => {
		const r = mount(PlainDiv);
		first(r).innerHTML = 'bonjour';
		expect(first(r).innerHTML).toBe('bonjour');
		r.update(PlainDiv, undefined);
		expect(first(r).innerHTML).toBe('bonjour');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:1178 — should reset innerHTML when switching from a direct text child to an empty child
	it('clears the text when a text child transitions to null/undefined/false', () => {
		for (const empty of [null, undefined, false]) {
			const r = mount(TextHole, { v: 'bonjour' });
			expect(first(r).textContent).toBe('bonjour');
			r.update(TextHole, { v: empty });
			expect(first(r).textContent).toBe('');
			r.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:1196 — should empty element when removing innerHTML
	it('empties the element when the raw HTML goes away', () => {
		const r = mount(DangerValue, { h: ':)' });
		expect(first(r).innerHTML).toBe(':)');
		r.update(DangerValue, { h: undefined });
		expect(first(r).innerHTML).toBe('');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:1210 — should transition from string content to innerHTML
	it('transitions string content → innerHTML on the same element', () => {
		const r = mount(DeoptContent, { mode: 'text', text: 'hello' });
		const el = r.container.querySelector('div[id="dc"]') as HTMLElement;
		expect(el.innerHTML).toBe('hello');
		r.update(DeoptContent, { mode: 'html', html: 'goodbye' });
		expect((r.container.querySelector('div[id="dc"]') as HTMLElement).innerHTML).toBe('goodbye');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:1224 — should transition from innerHTML to string content
	it('transitions innerHTML → string content on the same element', () => {
		const r = mount(DeoptContent, { mode: 'html', html: 'bonjour' });
		expect((r.container.querySelector('div[id="dc"]') as HTMLElement).innerHTML).toBe('bonjour');
		r.update(DeoptContent, { mode: 'text', text: 'adieu' });
		expect((r.container.querySelector('div[id="dc"]') as HTMLElement).innerHTML).toBe('adieu');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:1238 — should transition from innerHTML to children in nested el
	it('transitions innerHTML → element children in a nested element', () => {
		const r = mount(NestedDeoptContent, { mode: 'html' });
		expect(r.container.textContent).toBe('bonjour');
		r.update(NestedDeoptContent, { mode: 'children' });
		expect(r.container.textContent).toBe('adieu');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:1262 — should transition from children to innerHTML in nested el
	it('transitions element children → innerHTML in a nested element', () => {
		const r = mount(NestedDeoptContent, { mode: 'children' });
		expect(r.container.textContent).toBe('adieu');
		r.update(NestedDeoptContent, { mode: 'html' });
		expect(r.container.textContent).toBe('bonjour');
		r.unmount();
	});
});

describe('ReactDOMComponent — dangerouslySetInnerHTML validation', () => {
	// Per ReactDOMComponent-test.js:1852 — should validate against multiple children props
	// Per ReactDOMComponent-test.js:1879 — should validate use of dangerouslySetInnerHTM with JSX
	// Per ReactDOMComponent-test.js:1888 — should validate use of dangerouslySetInnerHTML with object
	// GAP: React throws for a dangerouslySetInnerHTML value that is not
	// `{__html: …}` (a string, or an object without __html) in DEV *and* prod;
	// octane reads `.__html` off whatever it gets (undefined → '') and renders
	// silently. Runtime location: setAttribute's dangerouslySetInnerHTML arm
	// (runtime.ts:3508) / applyDeoptProps — no shape validation.
	it('throws for a malformed dangerouslySetInnerHTML value', () => {
		expect(() => mount(MalformedDanger, { d: '<span>Hi Jim!</span>' })).toThrow();
		expect(() => mount(MalformedDanger, { d: { foo: 'bar' } })).toThrow();
	});

	// Per ReactDOMComponent-test.js:2068 — should validate against multiple children props (update)
	// GAP: React throws when `children` and `dangerouslySetInnerHTML` are both
	// present ("Can only set one…"); octane lets the raw HTML own the content and
	// ignores the children (see danger-html.test.ts DeoptDanger note) — no error.
	// Runtime location: hostElementBody / applyDeoptProps (hasDangerHTML,
	// runtime.ts ~5377).
	it('throws when children and dangerouslySetInnerHTML are both set', () => {
		const r = mount(ChildrenPlusDanger, { on: false });
		expect(() => r.update(ChildrenPlusDanger, { on: true })).toThrow();
		r.unmount();
	});
});

describe('ReactDOMComponent — void elements', () => {
	// Per ReactDOMComponent-test.js:1794 — should throw on children for void elements
	// (also accounts :1932 — class-component duplicate — and :2038 — the update-path
	// variant). React rejects at render time; octane's templates are static, so the
	// same authoring error is rejected at COMPILE time (both client and server
	// emit), before it can silently drop the children out of `<input>…</input>`.
	it('rejects children on a void element at compile time', () => {
		const src = `export function VoidChildren() @{ <input id="vc">{'children'}</input> }`;
		expect(() => compile(src, 'void-children.tsrx')).toThrow(/void element/);
		expect(() => compile(src, 'void-children.tsrx', { mode: 'server' })).toThrow(/void element/);
	});

	// Per ReactDOMComponent-test.js:1807 — should throw on dangerouslySetInnerHTML for
	// void elements (also accounts :2053 — the update-path variant).
	it('rejects dangerouslySetInnerHTML on a void element at compile time', () => {
		const src = `export function VoidDanger(props) @{ <input id="vd" dangerouslySetInnerHTML={{ __html: props.h }} /> }`;
		expect(() => compile(src, 'void-danger.tsrx')).toThrow(/void element/);
		expect(() => compile(src, 'void-danger.tsrx', { mode: 'server' })).toThrow(/void element/);
	});

	// Per ReactDOMComponent-test.js:1807 — the RUNTIME arm: a de-opt (createElement)
	// descriptor or a spread can carry dangerouslySetInnerHTML onto a void host where
	// the compiler can't see it; setAttribute's danger arm throws (React's message).
	it('throws for dangerouslySetInnerHTML on a void element on the de-opt path', () => {
		expect(() => mount(VoidDeoptDanger, { h: 'content' })).toThrow(/void element/);
	});
});

describe('ReactDOMComponent — tag sanitization (client)', () => {
	// Per ReactDOMComponent-test.js:2202 — should throw when an invalid tag name is used
	it('throws for an invalid tag name', () => {
		expect(() => mount(BadTag, { tag: 'script tag' })).toThrow();
	});

	// Per ReactDOMComponent-test.js:2213 — should throw when an attack vector is used
	it('throws for a markup-injection tag name', () => {
		expect(() => mount(BadTag, { tag: 'div><img /><div' })).toThrow();
	});
});
