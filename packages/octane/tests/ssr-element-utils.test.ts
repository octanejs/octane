import { describe, it, expect, vi } from 'vitest';
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

function captureThrown(run: () => unknown): unknown {
	try {
		run();
	} catch (error) {
		return error;
	}
	throw new Error('Expected callback to throw');
}

describe('octane/server element utilities', () => {
	it('isValidElement recognizes server createElement descriptors only', () => {
		const element = createElement('li', { class: 'row' }, 'x');
		expect(isValidElement(element)).toBe(true);
		expect(Object.isFrozen(element)).toBe(true);
		expect(Object.isFrozen(element.props)).toBe(true);
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
		const clonedChildren = cloneElement(base, null, 'a', 'b').children;
		expect(clonedChildren).toEqual(['a', 'b']);
		expect(Object.isFrozen(clonedChildren)).toBe(false);
		clonedChildren.push('c');
		expect(clonedChildren).toEqual(['a', 'b', 'c']);
		const createdChildren = createElement('g', null, 'a', 'b').children;
		expect(Object.isFrozen(createdChildren)).toBe(true);
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
		const flattened = Children.toArray(kids);
		expect(flattened.length).toBe(3);
		expect(Object.isFrozen(flattened[0])).toBe(true);
		expect(Object.isFrozen(flattened[0].props)).toBe(true);
		const mapped = Children.map(kids, (c: unknown) => (c == null ? null : 'x'));
		expect(mapped).toEqual(['x', 'x', 'x']);
		expect(Children.map(null, () => 'x')).toBe(null);
		const only = createElement('g');
		expect(Children.only(only)).toBe(only);
		expect(() => Children.only([only])).toThrow(/single element/);
	});

	it('Children ignores callable iterables like the client and React', () => {
		const callable = Object.assign(function callable() {}, {
			*[Symbol.iterator]() {
				yield createElement('i');
			},
		});
		const callback = vi.fn((child) => child);
		expect(Children.toArray(callable)).toEqual([]);
		expect(Children.count(callable)).toBe(0);
		expect(Children.map(callable, callback)).toEqual([]);
		expect(callback).not.toHaveBeenCalled();
	});

	it('Children direct calls unwrap fulfilled and rejected promises without leaking SSR state', async () => {
		const pending = new Promise(() => {});
		expect(captureThrown(() => Children.toArray(pending))).toBe(pending);

		const fulfilled = Promise.resolve(createElement('i', { key: 'ready' }));
		expect(captureThrown(() => Children.toArray(fulfilled))).toBe(fulfilled);
		await fulfilled;
		const resolved = Children.toArray(fulfilled);
		expect(resolved).toHaveLength(1);
		expect(resolved[0].type).toBe('i');

		const reason = new Error('no children');
		const rejected = Promise.reject(reason);
		expect(captureThrown(() => Children.toArray(rejected))).toBe(rejected);
		await rejected.catch(() => {});
		expect(captureThrown(() => Children.toArray(rejected))).toBe(reason);
	});

	it('Children promises keep SSR boundary suspension bookkeeping during render', () => {
		const promise = new Promise(() => {});
		const App = (props: { promise: Promise<unknown> }, scope: unknown) =>
			(Server as any).ssrTry(
				scope,
				'children-promise',
				() => {
					Children.toArray(props.promise);
					return '<strong>ready</strong>';
				},
				() => '<em>loading</em>',
				null,
			);
		const { html } = renderToStaticMarkup(App, { promise });
		expect(html).toContain('<em>loading</em>');
		expect(html).not.toContain('<strong>ready</strong>');
	});

	it('createPortal descriptors SSR as a bare site anchor (content is client-side)', () => {
		const App = () => createPortal(createElement('div', null, 'layer'), 'body');
		const { html } = (Server as any).renderToString(App);
		// The portal site leaves its anchor only — no portal content in the stream.
		expect(html).not.toContain('layer');
	});
});
