import { describe, it, expect } from 'vitest';
import { createElement, cloneElement, isValidElement, Children } from '../src/index.js';
import { mount } from './_helpers';
import { CloneDemo, OnlyDemo, MapDemo } from './_fixtures/clone-children.tsrx';

// React-compatible cloneElement / Children / isValidElement primitives (the foundation
// for a Radix-style Slot/asChild). Descriptor-level unit assertions + rendered output.

describe('isValidElement', () => {
	it('is true only for createElement/JSX descriptors', () => {
		expect(isValidElement(createElement('div', null))).toBe(true);
		expect(isValidElement(createElement(() => null, null))).toBe(true);
		expect(isValidElement('text')).toBe(false);
		expect(isValidElement(null)).toBe(false);
		expect(isValidElement(42)).toBe(false);
		expect(isValidElement([createElement('div', null)])).toBe(false);
		expect(isValidElement({ type: 'div' })).toBe(false); // not tagged
	});
});

describe('cloneElement', () => {
	it('shallow-merges props (config wins) and keeps type', () => {
		const base = createElement('button', { type: 'button', id: 'a', disabled: true });
		const cloned = cloneElement(base, { id: 'b', 'data-x': '1' });
		expect(cloned.type).toBe('button');
		expect(cloned.props).toEqual({ type: 'button', id: 'b', disabled: true, 'data-x': '1' });
		// original is untouched
		expect((base.props as any).id).toBe('a');
		expect((base.props as any)['data-x']).toBeUndefined();
	});

	it('preserves original children when none are passed', () => {
		const base = createElement('div', null, 'hello');
		const cloned = cloneElement(base, { id: 'x' });
		expect(cloned.children).toBe('hello');
	});

	it('replaces children when passed positionally', () => {
		const base = createElement('div', null, 'old');
		const cloned = cloneElement(base, null, 'new');
		expect(cloned.children).toBe('new');
	});

	it('overrides key from config, else keeps the original', () => {
		const base = createElement('li', { key: 'k1' });
		expect(base.key).toBe('k1');
		expect(cloneElement(base, { key: 'k2' }).key).toBe('k2');
		expect(cloneElement(base, { id: 'x' }).key).toBe('k1');
	});

	it('folds children into props.children for component descriptors', () => {
		const Comp = () => null;
		const base = createElement(Comp, { a: 1 }, 'kid');
		const cloned = cloneElement(base, { b: 2 });
		expect((cloned.props as any).children).toBe('kid');
		expect(cloned.props as any).toMatchObject({ a: 1, b: 2, children: 'kid' });
	});

	it('throws on a non-element', () => {
		expect(() => cloneElement('nope' as any, {})).toThrow(/must be an element/);
	});
});

describe('Children', () => {
	const a = createElement('i', { key: 'a' }, 'a');
	const b = createElement('i', { key: 'b' }, 'b');
	const c = createElement('i', { key: 'c' }, 'c');

	it('toArray flattens nested arrays and drops nullish/boolean', () => {
		const flattened = Children.toArray([a, null, [b, false, [c]], undefined]);
		expect(flattened.map((child) => child.key)).toEqual(['.$a', '.2:$b', '.2:2:$c']);
		expect(flattened.map((child) => child.props.children)).toEqual(['a', 'b', 'c']);
		expect(Children.toArray(a)[0]).toMatchObject({ key: '.$a', type: 'i' });
		expect(Children.toArray(null)).toEqual([]);
	});

	it('count includes empty (null/boolean) leaves, like React', () => {
		expect(Children.count([a, b, c])).toBe(3);
		expect(Children.count([a, null, b])).toBe(3); // null counted
		expect(Children.count(null)).toBe(0); // top-level nullish → 0
		expect(Children.count(a)).toBe(1);
	});

	it('map flattens + drops nullish results, visiting empties as null', () => {
		const seen: any[] = [];
		const out = Children.map([a, null, b], (child, i) => {
			seen.push([child, i]);
			return child; // null child → null result → dropped
		});
		expect(out?.map((child) => child.key)).toEqual(['.$a', '.$b']);
		expect(out?.map((child) => child.props.children)).toEqual(['a', 'b']);
		expect(seen).toEqual([
			[a, 0],
			[null, 1],
			[b, 2],
		]);
		expect(Children.map(null, (x) => x)).toBe(null);
	});

	it('forEach visits every leaf (empties as null)', () => {
		const seen: any[] = [];
		Children.forEach([a, [b, null], c], (child) => seen.push(child));
		expect(seen).toEqual([a, b, null, c]);
	});

	it('only returns the single element or throws', () => {
		expect(Children.only(a)).toBe(a);
		expect(() => Children.only([a, b])).toThrow(/single element/);
		expect(() => Children.only('text' as any)).toThrow(/single element/);
		expect(() => Children.only(null as any)).toThrow(/single element/);
	});
});

describe('rendered output', () => {
	it('CloneSlot clones a prop element, merging props', () => {
		const r = mount(CloneDemo);
		const btn = r.find('#wrap button');
		expect(btn.getAttribute('id')).toBe('slotted');
		expect(btn.getAttribute('type')).toBe('button'); // original kept
		expect(btn.getAttribute('data-x')).toBe('1'); // merged in
		expect(btn.textContent).toBe('go'); // children preserved
		r.unmount();
	});

	it('OnlyChild resolves + clones the single element', () => {
		const r = mount(OnlyDemo);
		const span = r.find('#wrap span');
		expect(span.getAttribute('data-only')).toBe('yes');
		expect(span.textContent).toBe('hi');
		r.unmount();
	});

	it('MapKids maps a descriptor array with index + count', () => {
		const r = mount(MapDemo);
		const ul = r.find('#wrap ul');
		expect(ul.getAttribute('data-count')).toBe('3');
		const lis = Array.from(ul.querySelectorAll('li'));
		expect(lis.map((li) => li.getAttribute('data-i'))).toEqual(['0', '1', '2']);
		expect(lis.map((li) => li.textContent)).toEqual(['a', 'b', 'c']);
		r.unmount();
	});
});
