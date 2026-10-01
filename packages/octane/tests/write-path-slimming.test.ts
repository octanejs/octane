import { afterEach, describe, expect, it, vi } from 'vitest';
import { setSpread, setStyle, setStyleProperty } from '../src/index.js';
import { mount } from './_helpers.js';
import { WritePathEdge, WritePathSpread } from './_fixtures/write-path-slimming.tsrx';

// The changed-commit write path: object styles write verified CSSStyleDeclaration
// IDL properties through `style[name] = value` (saving the kebab conversion and
// the setProperty property lookup), and spread `data-*` keys take the lean
// setStringData writer instead of the generic setAttribute router. Every
// assertion here sits on the DOM boundary — CSSStyleDeclaration.prototype's
// public setProperty spy, final style/attribute values — never on runtime
// internals.

function setPropertySpy(el: HTMLElement | SVGElement) {
	return vi.spyOn(Object.getPrototypeOf(el.style), 'setProperty');
}

function watchWrites(el: Element): MutationObserver {
	const observer = new MutationObserver(() => {});
	observer.observe(el, {
		attributes: true,
		characterData: true,
		childList: true,
		subtree: true,
	});
	return observer;
}

afterEach(() => {
	vi.restoreAllMocks();
});

// The one-time IDL writability probe performs a `setProperty` call on a
// detached declaration to learn the platform's priority semantics. Warm it
// through the public write path so a setProperty spy installed afterwards
// observes only the write under test.
function warmIdlProbe() {
	setStyle(document.createElement('div'), { width: 1 }, undefined);
}

describe('style writes — direct IDL property writes', () => {
	it('writes verified camelCase properties without calling CSSOM setProperty', () => {
		warmIdlProbe();
		const el = document.createElement('div');
		const spy = setPropertySpy(el);
		setStyle(el, { strokeWidth: 2, strokeOpacity: 0.5, width: 3 }, undefined);
		// The DOM result is identical to the setProperty route — the spy only
		// proves the declaration write no longer pays the kebab + setProperty
		// round-trip.
		expect(el.style.getPropertyValue('stroke-width')).toBe('2');
		expect(el.style.getPropertyValue('stroke-opacity')).toBe('0.5');
		expect(el.style.getPropertyValue('width')).toBe('3px');
		expect(el.getAttribute('style')).toContain('stroke-width: 2');
		expect(spy).not.toHaveBeenCalled();
	});

	it('takes the direct path through a single dynamic declaration update', () => {
		const el = document.createElement('div');
		setStyleProperty(el, 'strokeWidth', 2, '', undefined);
		expect(el.style.getPropertyValue('stroke-width')).toBe('2');
		const spy = setPropertySpy(el);
		setStyleProperty(el, 'strokeWidth', 4, '', 2);
		expect(el.style.getPropertyValue('stroke-width')).toBe('4');
		expect(spy).not.toHaveBeenCalled();
	});

	it('keeps px/unitless coercion identical on the direct write path', () => {
		const el = document.createElement('div');
		setStyle(el, { width: 2, opacity: 0.5, zIndex: 3, marginTop: 0, lineHeight: 2 }, undefined);
		expect(el.style.width).toBe('2px');
		expect(el.style.opacity).toBe('0.5');
		expect(el.style.zIndex).toBe('3');
		expect(el.style.marginTop).toBe('0px'); // 0 carries no unit but still parses
		expect(el.style.lineHeight).toBe('2');
	});

	it('keeps custom properties, !important, kebab, and unverified names on setProperty', () => {
		const el = document.createElement('div');
		const spy = setPropertySpy(el);
		setStyle(
			el,
			{
				'--accent': 'red',
				width: '10px !important',
				'font-size': '13px',
				MozTransform: 'translateX(1px)',
				cssText: 'color: red',
			},
			undefined,
		);
		expect(el.style.getPropertyValue('--accent')).toBe('red');
		expect(el.style.getPropertyValue('width')).toBe('10px');
		expect(el.style.getPropertyPriority('width')).toBe('important');
		expect(el.style.fontSize).toBe('13px');
		// A name the platform does not expose as an IDL attribute keeps the
		// setProperty route — and leaves no dead JS expando behind.
		expect(Object.prototype.hasOwnProperty.call(el.style, 'MozTransform')).toBe(false);
		// `cssText` as an object key is not a declaration write: it hyphenates to
		// the unknown `css-text` property, matching the pre-existing contract.
		expect(el.style.color).toBe('');
		const names = spy.mock.calls.map((call) => call[0]);
		expect(names).toContain('--accent');
		expect(names).toContain('font-size');
		expect(names).toContain('-moz-transform');
		expect(names).toContain('css-text');
		expect(spy).toHaveBeenCalledWith('width', '10px', 'important');
	});

	it('writes a probe-admitted vendor-prefixed name with the same DOM result', () => {
		const el = document.createElement('div');
		setStyle(el, { WebkitLineClamp: 2 }, undefined);
		expect(el.style.getPropertyValue('-webkit-line-clamp')).toBe('2');
	});

	it('diffs object styles across updates on the direct path, clearing dropped keys', () => {
		const el = document.createElement('div');
		setStyle(el, { strokeWidth: 1, color: 'red' }, undefined);
		setStyle(el, { strokeWidth: 3 }, { strokeWidth: 1, color: 'red' });
		expect(el.style.getPropertyValue('stroke-width')).toBe('3');
		expect(el.style.getPropertyValue('color')).toBe('');
		expect(el.getAttribute('style')).toBe('stroke-width: 3;');
	});

	it('clears a stale !important priority when a plain value replaces it', () => {
		// Per spec a camelCase IDL assignment replaces the whole declaration —
		// priority included — exactly like setProperty(prop, value). Priority-
		// preserving CSSOM implementations (jsdom) are probed once and take the
		// explicit setProperty route for this transition.
		const el = document.createElement('div');
		setStyle(el, { color: 'red !important' }, undefined);
		expect(el.style.getPropertyPriority('color')).toBe('important');
		setStyle(el, { color: 'blue' }, { color: 'red !important' });
		expect(el.style.getPropertyValue('color')).toBe('blue');
		expect(el.style.getPropertyPriority('color')).toBe('');
	});

	it('keeps non-identifier keys on the setProperty route without throwing', () => {
		// '0' reads as a string through the declaration's indexed getter but is
		// not an IDL attribute — a direct assignment would either expand or, on
		// jsdom's indexed-access proxy, throw. The write must stay on the
		// tolerant setProperty path.
		const el = document.createElement('div');
		expect(() => setStyle(el, { '0': 'ignored', width: 2 }, undefined)).not.toThrow();
		expect(el.style.getPropertyValue('width')).toBe('2px');
	});
});

describe('spread data-* writes — lean attribute writer', () => {
	it('writes, updates, and removes data-* attributes through a spread', () => {
		const el = document.createElement('div');
		setSpread(el, { 'data-alpha': '1', 'data-beta': 2 }, undefined);
		expect(el.getAttribute('data-alpha')).toBe('1');
		expect(el.getAttribute('data-beta')).toBe('2');
		setSpread(el, { 'data-alpha': '3', 'data-beta': 2 }, { 'data-alpha': '1', 'data-beta': 2 });
		expect(el.getAttribute('data-alpha')).toBe('3');
		expect(el.getAttribute('data-beta')).toBe('2');
	});

	it('performs no DOM write when a data-* value is unchanged', () => {
		const el = document.createElement('div');
		setSpread(el, { 'data-alpha': '1' }, undefined);
		const spy = vi.spyOn(el, 'setAttribute');
		const removeSpy = vi.spyOn(el, 'removeAttribute');
		setSpread(el, { 'data-alpha': '1' }, { 'data-alpha': '1' });
		expect(spy).not.toHaveBeenCalled();
		expect(removeSpy).not.toHaveBeenCalled();
	});

	it('preserves the data-* value contract — booleans stringify, nullish/function/symbol remove', () => {
		const el = document.createElement('div');
		setSpread(
			el,
			{ 'data-t': true, 'data-f': false, 'data-n': 1.5, 'data-o': { toString: () => 'custom' } },
			undefined,
		);
		expect(el.getAttribute('data-t')).toBe('true');
		expect(el.getAttribute('data-f')).toBe('false');
		expect(el.getAttribute('data-n')).toBe('1.5');
		expect(el.getAttribute('data-o')).toBe('custom');
		setSpread(
			el,
			{ 'data-t': null, 'data-f': undefined, 'data-n': Symbol('x'), 'data-o': () => {} },
			{ 'data-t': true, 'data-f': false, 'data-n': 1.5, 'data-o': { toString: () => 'custom' } },
		);
		expect(el.hasAttribute('data-t')).toBe(false);
		expect(el.hasAttribute('data-f')).toBe(false);
		expect(el.hasAttribute('data-n')).toBe(false);
		expect(el.hasAttribute('data-o')).toBe(false);
	});

	it('keeps invalid data-* names on the skip path — never throws', () => {
		const el = document.createElement('div');
		// `data-x y` fails VALID_ATTR_NAME; the platform setAttribute would throw
		// InvalidCharacterError, so the write must stay on the skip-and-warn route.
		expect(() => setSpread(el, { 'data-x y': 'v', 'data-ok': '1' }, undefined)).not.toThrow();
		expect(el.getAttribute('data-ok')).toBe('1');
		expect(el.getAttribute('data-x y')).toBe(null);
	});

	it('writes data-* verbatim on HTML custom elements', () => {
		const el = document.createElement('x-thing');
		setSpread(el, { 'data-foo': 'v1' }, undefined);
		expect(el.getAttribute('data-foo')).toBe('v1');
		setSpread(el, { 'data-foo': false }, { 'data-foo': 'v1' });
		expect(el.getAttribute('data-foo')).toBe('false');
	});

	it('keeps aria-* spread keys on the generic route with enumerated coercion', () => {
		const el = document.createElement('div');
		setSpread(el, { 'aria-hidden': false }, undefined);
		expect(el.getAttribute('aria-hidden')).toBe('false');
		setSpread(el, { 'aria-hidden': true }, { 'aria-hidden': false });
		expect(el.getAttribute('aria-hidden')).toBe('true');
		setSpread(el, { 'aria-hidden': null }, { 'aria-hidden': true });
		expect(el.hasAttribute('aria-hidden')).toBe(false);
	});
});

describe('compiled spread/style commits', () => {
	it('commits a changed svg edge pulse — styles write, attrs write, no setProperty for IDL names', () => {
		const r = mount(WritePathEdge, {
			cls: 'edge',
			d: 'M0 0',
			style: { strokeWidth: 1, strokeOpacity: 0.5 },
			attrs: { 'data-x': '1' },
		});
		try {
			const path = r.find('#wp-edge') as SVGElement;
			expect(path.getAttribute('data-x')).toBe('1');
			expect(path.style.getPropertyValue('stroke-width')).toBe('1');
			const spy = setPropertySpy(path);
			r.update(WritePathEdge, {
				cls: 'edge',
				d: 'M0 0',
				style: { strokeWidth: 2, strokeOpacity: 0.9 },
				attrs: { 'data-x': '2' },
			});
			expect(path.style.getPropertyValue('stroke-width')).toBe('2');
			expect(path.style.getPropertyValue('stroke-opacity')).toBe('0.9');
			expect(path.getAttribute('data-x')).toBe('2');
			expect(
				spy.mock.calls.filter((call) => call[0] === 'stroke-width' || call[0] === 'stroke-opacity'),
			).toEqual([]);
		} finally {
			r.unmount();
		}
	});

	it('an unchanged spread record commits no writes; a changed data-* key commits', () => {
		const r = mount(WritePathSpread, {
			tick: 'a',
			spread: { 'data-x': '1', 'data-y': 's' },
		});
		try {
			const el = r.find('#wp-spread');
			expect(el.getAttribute('data-x')).toBe('1');
			const observer = watchWrites(el);
			// A fresh source object resolving to the same record must not touch the
			// DOM at all — the resolved-record bail plus the per-key identity skip.
			r.update(WritePathSpread, {
				tick: 'b',
				spread: { 'data-y': 's', 'data-x': '1' },
			});
			expect(r.find('#wp-tick').textContent).toBe('b');
			expect(observer.takeRecords()).toEqual([]);
			r.update(WritePathSpread, {
				tick: 'c',
				spread: { 'data-x': '2', 'data-y': 's' },
			});
			expect(el.getAttribute('data-x')).toBe('2');
			expect(el.getAttribute('data-y')).toBe('s');
			observer.disconnect();
		} finally {
			r.unmount();
		}
	});
});
