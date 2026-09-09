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
	createScopedElement,
	createScopedValue,
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
	it.each(['renderToString', 'renderToStaticMarkup'] as const)(
		'%s preserves omitted children when a component forwards merged props',
		(renderMethod) => {
			function Forwarder({ defaults, ...props }: { defaults: object; children?: unknown }) {
				return Server.createElement('span', { ...defaults, ...props });
			}
			const defaults = { children: 'forwarded' };
			const render = (props: { defaults: object; children?: unknown }) =>
				Server[renderMethod](() => Server.createElement(Forwarder, props)).html;
			expect(render({ defaults })).toContain('>forwarded</span>');
			for (const children of [null, undefined, false]) {
				expect(render({ defaults, children })).not.toContain('forwarded');
			}
			expect(render({ defaults, children: 'explicit' })).toContain('>explicit</span>');
		},
	);

	it('isValidElement recognizes server createElement descriptors only', () => {
		const element = createElement('li', { class: 'row' }, 'x');
		expect(isValidElement(element)).toBe(true);
		expect(Object.isFrozen(element)).toBe(true);
		expect(Object.isFrozen(element.props)).toBe(true);
		expect(isValidElement({ type: 'li', props: {} })).toBe(false);
		expect(isValidElement(null)).toBe(false);
		expect(isValidElement('li')).toBe(false);
	});

	it('lifts key out of props with the same nullish rules as the client entry', () => {
		// `key` is never a real prop, a nullish key still stringifies (React's
		// shape), and an explicitly-undefined key is treated as absent.
		expect(createElement('li', { key: 12, class: 'row' }).key).toBe('12');
		expect(createElement('li', { key: 12, class: 'row' }).props).toEqual({ class: 'row' });
		expect(createElement('li', { key: null }).key).toBe('null');
		expect(createElement('li', { key: undefined, class: 'row' }).key).toBe(null);
		expect(createElement('li', { class: 'row' }).key).toBe(null);
	});

	it('never invokes a React warning getter standing in for key', () => {
		// A React DEV build installs a non-enumerable `key` getter on props that
		// WARNS when read and yields undefined. Feeding such a props object back
		// through createElement must neither treat it as a real key nor trigger
		// the warning, so the getter has to stay uncalled.
		const props: any = {};
		const keyGetter: any = vi.fn(() => undefined);
		keyGetter.isReactWarning = true;
		Object.defineProperty(props, 'key', { enumerable: false, get: keyGetter });
		expect(createElement('li', props).key).toBe(null);
		expect(keyGetter).not.toHaveBeenCalled();
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

	it('keeps each deferred element child with its original scope through cloning and mapping', () => {
		const reads: string[] = [];
		const first = createScopedElement('span', { key: 'first', 'data-row': 'first' }, () => {
			reads.push('first');
			return 'alpha';
		});
		const second = createScopedElement('span', { key: 'second', 'data-row': 'second' }, () => {
			reads.push('second');
			return 'beta';
		});
		const clone = cloneElement(first, { 'data-cloned': 'yes' });
		const mapped = Children.map([first, second], (child: unknown) => child);
		const replaced = cloneElement(first, { children: 'replacement' });
		expect(reads).toEqual([]);
		expect(Object.keys(first)).toEqual(['$$kind', 'type', 'props', 'key', 'ref', 'children']);
		expect(Object.getOwnPropertyDescriptor(first, 'children')).toMatchObject({
			configurable: false,
			enumerable: true,
		});
		expect(first.props.children).toBe('alpha');
		expect(second.children).toBe('beta');
		expect(clone.props.children).toBe('alpha');
		expect(mapped[0].children).toBe('alpha');
		expect(mapped[1].children).toBe('beta');
		expect(replaced.props.children).toBe('replacement');
		const html = renderToStaticMarkup(() => [clone, mapped[1], replaced]).html;
		expect(html).toContain('<span data-row="first" data-cloned="yes">alpha</span>');
		expect(html).toContain('<span data-row="second">beta</span>');
		expect(html).toContain('<span data-row="first">replacement</span>');
		expect(reads).toContain('first');
		expect(reads).toContain('second');
	});

	it('preserves spread and default children observations while deferring their replacement', () => {
		let sourceReads = 0;
		let defaultReads = 0;
		const Label = Object.assign(
			(props: { children?: unknown; id?: string }) =>
				createElement('span', { id: props.id }, props.children),
			{
				defaultProps: {
					role: 'label',
					get children() {
						defaultReads++;
						return 'unused default';
					},
					'data-after': 'suffix',
				},
			},
		);
		const spread = createScopedElement(
			Label,
			{
				id: 'spread',
				get children() {
					sourceReads++;
					return undefined;
				},
				title: 'provided',
			},
			() => 'deferred spread',
		);
		const defaulted = createScopedElement(Label, { id: 'defaulted' }, () => 'deferred default');
		expect(sourceReads).toBe(1);
		expect(defaultReads).toBe(2);
		expect(Object.keys(spread.props)).toEqual(['id', 'children', 'title', 'role', 'data-after']);
		expect(Object.keys(defaulted.props)).toEqual(['id', 'role', 'children', 'data-after']);
		expect(spread.props.children).toBe('deferred spread');
		expect(defaulted.props.children).toBe('deferred default');
		const html = renderToStaticMarkup(() => [spread, defaulted]).html;
		expect(html).toContain('<span id="spread">deferred spread</span>');
		expect(html).toContain('<span id="defaulted">deferred default</span>');
	});

	it('respects inherited children when default props are applied', () => {
		const assigned: unknown[] = [];
		const prototype = {
			get children() {
				return undefined;
			},
			set children(value: unknown) {
				assigned.push(value);
			},
		};
		const source = Object.create(null);
		Object.defineProperty(source, '__proto__', { enumerable: true, value: prototype });
		source.id = 'inherited';
		const Label = Object.assign(
			(props: { children?: unknown }) => createElement('span', null, props.children),
			{ defaultProps: { role: 'status', children: 'default', title: 'end' } },
		);
		const element = createScopedElement(Label, source, () => 'deferred');
		expect(assigned).toEqual(['default']);
		expect(Object.keys(element.props)).toEqual(['id', 'role', 'title', 'children']);
		expect(element.props.children).toBe('deferred');
		expect(renderToStaticMarkup(() => element).html).toContain('<span>deferred</span>');
	});

	it('runs inherited config setters before installing deferred children', () => {
		const assigned: unknown[] = [];
		const inherited = {
			set children(value: unknown) {
				assigned.push(value);
			},
			set touch(value: unknown) {
				assigned.push(`touch:${String(value)}`);
				(this as { children?: unknown }).children = 'from touch';
			},
		};
		const config = Object.create(null) as Record<string, unknown>;
		Object.defineProperty(config, '__proto__', { enumerable: true, value: inherited });
		config.children = 'provided';
		config.touch = 1;
		const element = createScopedElement('span', config, () => 'deferred');
		expect(assigned).toEqual(['provided', 'touch:1', 'from touch']);
		expect(Object.keys(element.props)).toEqual(['children']);
		expect(element.props.children).toBe('deferred');
	});

	it('allows a later inherited setter to write copied children', () => {
		const property = '__octaneScopedTouchTest__';
		const observed: unknown[] = [];
		Object.defineProperty(Object.prototype, property, {
			configurable: true,
			set(this: { children?: unknown }, value: unknown) {
				observed.push(value);
				this.children = 'from inherited setter';
			},
		});
		try {
			const element = createScopedElement(
				'span',
				{ children: 'provided', [property]: 'trigger' },
				() => 'deferred',
			);
			expect(observed).toEqual(['trigger']);
			expect(element.props.children).toBe('deferred');
		} finally {
			delete (Object.prototype as Record<string, unknown>)[property];
		}
	});

	it('keeps complete deferred records independent when inspected', () => {
		const first = createScopedValue(() => createScopedElement('strong', { key: 'a' }, () => 'one'));
		const second = createScopedValue(() => createScopedElement('em', { key: 'b' }, () => 'two'));
		expect(Object.keys(first)).toEqual(['$$kind', 'type', 'props', 'key', 'ref', 'children']);
		expect(first.type).toBe('strong');
		expect(first.key).toBe('a');
		expect(first.children).toBe('one');
		expect(second.type).toBe('em');
		expect(second.key).toBe('b');
		expect(second.props.children).toBe('two');
		expect(renderToStaticMarkup(() => [first, second]).html).toContain('<strong>one</strong>');
		expect(renderToStaticMarkup(() => [first, second]).html).toContain('<em>two</em>');
	});

	it('clones and maps scoped values wrapping deferred scoped elements', () => {
		const reads: string[] = [];
		const first = createScopedValue(() =>
			createScopedElement('span', { key: 'a' }, () => {
				reads.push('a');
				return 'alpha';
			}),
		);
		const second = createScopedValue(() =>
			createScopedElement('em', { key: 'b' }, () => {
				reads.push('b');
				return 'beta';
			}),
		);
		const clone = cloneElement(first, { title: 'copy' });
		const mapped = Children.map([first, second], (child: unknown) => child);
		const flattened = Children.toArray([first, second]);
		expect(reads).toEqual([]);
		expect(clone.children).toBe('alpha');
		expect(mapped[0].children).toBe('alpha');
		expect(mapped[1].children).toBe('beta');
		expect(flattened[0].children).toBe('alpha');
		expect(flattened[1].children).toBe('beta');
		expect(cloneElement(mapped[1]).children).toBe('beta');
		expect(reads).toContain('a');
		expect(reads).toContain('b');
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
			Server.ssrHtml(
				(Server as any).ssrTry(
					scope,
					'children-promise',
					() => {
						Children.toArray(props.promise);
						return '<strong>ready</strong>';
					},
					() => '<em>loading</em>',
					null,
				),
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
