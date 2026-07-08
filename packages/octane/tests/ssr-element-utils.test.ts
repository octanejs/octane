import { describe, it, expect } from 'vitest';
import * as Server from 'octane/server';

// `octane/server` must export the React-compatible element utilities the
// client entry has — bindings that inspect/re-project descriptor children
// (recharts' axis-tick cloning, a Radix-style Slot) compile the SAME source
// for both modes, so `import { cloneElement, isValidElement } from 'octane'`
// has to resolve under the server build too. (Same gap class as the
// flushSync/isChildrenBlock server-export fixes.)

const {
	createElement,
	cloneElement,
	isValidElement,
	Children,
	createPortal,
	renderToStaticMarkup,
} = Server as any;

describe('octane/server element utilities', () => {
	it('isValidElement recognizes server createElement descriptors only', () => {
		expect(isValidElement(createElement('li', { class: 'row' }, 'x'))).toBe(true);
		expect(isValidElement({ type: 'li', props: {} })).toBe(false);
		expect(isValidElement(null)).toBe(false);
		expect(isValidElement('li')).toBe(false);
	});

	it('cloneElement merges props under config, overrides key, keeps children', () => {
		const base = createElement('text', { x: 1, fill: 'red', key: 'a' }, 'label');
		const clone = cloneElement(base, { x: 2, y: 3, key: 'b' });
		expect(clone.type).toBe('text');
		expect(clone.key).toBe('b');
		expect(clone.props.x).toBe(2);
		expect(clone.props.y).toBe(3);
		expect(clone.props.fill).toBe('red');
		expect(clone.children).toBe('label');
		// Original untouched.
		expect(base.props.x).toBe(1);
		expect(base.key).toBe('a');
	});

	it('positional children replace the originals; none passed keeps them', () => {
		const base = createElement('g', null, 'one');
		expect(cloneElement(base, null, 'two').children).toBe('two');
		expect(cloneElement(base, null, 'a', 'b').children).toEqual(['a', 'b']);
		expect(cloneElement(base, { 'data-x': '1' }).children).toBe('one');
	});

	it('a cloned host descriptor renders through the SSR serializer', () => {
		const base = createElement('span', { class: 'tick' }, 'v');
		const clone = cloneElement(base, { class: 'tick tick-big' });
		const App = () => clone;
		const { html } = renderToStaticMarkup(App);
		expect(html).toBe('<span class="tick tick-big">v</span>');
	});

	it('throws on a non-element, like the client entry', () => {
		expect(() => cloneElement({ not: 'an element' } as any)).toThrow(/cloneElement/);
	});

	it('Children flattens, drops empties from results, and counts like React', () => {
		// 5 visited leaves (null and false ARE visited, as `null` — React parity).
		const kids = [createElement('a'), null, [createElement('b'), false], 'txt'];
		expect(Children.count(kids)).toBe(5);
		expect(Children.toArray(kids).length).toBe(3);
		const mapped = Children.map(kids, (c: unknown) => (c == null ? null : 'x'));
		expect(mapped).toEqual(['x', 'x', 'x']);
		expect(Children.map(null, () => 'x')).toBe(null);
		const only = createElement('g');
		expect(Children.only(only)).toBe(only);
		expect(() => Children.only([only])).toThrow(/single element/);
	});

	it('createPortal descriptors SSR as a bare site anchor (content is client-side)', () => {
		const App = () => createPortal(createElement('div', null, 'layer'), 'body');
		const { html } = (Server as any).renderToString(App);
		// The portal site leaves its anchor only — no portal content in the stream.
		expect(html).not.toContain('layer');
	});
});
