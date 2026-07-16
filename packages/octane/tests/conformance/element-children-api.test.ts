import { describe, expect, it, vi } from 'vitest';
import {
	Children,
	cloneElement,
	createElement,
	createPortal,
	createRoot,
	flushSync,
	isValidElement,
	lazy,
} from 'octane';
import { act, mount } from '../_helpers.js';
import {
	LazyChild,
	LazyChildrenHost,
	PromiseChildrenHost,
} from './_fixtures/element-children-api.tsrx';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function valuesIterable(values: any[]): any {
	return {
		'@@iterator'() {
			let index = 0;
			return {
				next() {
					return index < values.length
						? { value: values[index++], done: false }
						: { value: undefined, done: true };
				},
			};
		},
	};
}

function RenderValue(props: { value: any }): any {
	return props.value;
}

function missingKeyWarnings(run: () => void): string[] {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		run();
		return warn.mock.calls
			.map((call) => String(call[0]))
			.filter((call) => call.includes('unique "key"'));
	} finally {
		warn.mockRestore();
	}
}

describe('ReactChildren public behavior', () => {
	// Per ReactChildren-test.js:25.
	it('should support identity for simple', () => {
		const context = {};
		const child = createElement('span', { key: 'simple' });
		const seen: any[] = [];
		Children.forEach(
			child,
			function (this: any, value, index) {
				seen.push([this, value, index]);
			},
			context,
		);
		const mapped = Children.map(
			child,
			function (this: any, value) {
				expect(this).toBe(context);
				return value;
			},
			context,
		)!;
		expect(seen).toEqual([[context, child, 0]]);
		expect(mapped[0]).not.toBe(child);
		expect((mapped[0] as any).key).toBe('.$simple');
	});

	// Per ReactChildren-test.js:50.
	it('should support Portal components', () => {
		const portal = createPortal(createElement('span'), document.createElement('div'));
		const seen: any[] = [];
		Children.forEach(portal, (child, index) => seen.push([child, index]));
		expect(seen).toEqual([[portal, 0]]);
		expect(Children.map(portal, (child) => child)).toEqual([portal]);
	});

	// Per ReactChildren-test.js:75.
	it('should treat single arrayless child as being in array', () => {
		const child = createElement('span');
		const mapped = Children.map(child, (value) => value)!;
		expect(mapped).toHaveLength(1);
		expect((mapped[0] as any).key).toBe('.0');
	});

	// Per ReactChildren-test.js:96.
	it('should treat single child in array as expected', () => {
		const child = createElement('span', { key: 'simple' });
		const mapped = Children.map([child], (value) => value)!;
		expect(mapped).toHaveLength(1);
		expect((mapped[0] as any).key).toBe('.$simple');
	});

	// Per ReactChildren-test.js:117.
	it('should be called for each child', () => {
		const children = [createElement('div', { key: 'zero' }), null, createElement('div')];
		const seen: any[] = [];
		Children.forEach(children, (child, index) => seen.push([child, index]));
		expect(seen).toEqual([
			[children[0], 0],
			[null, 1],
			[children[2], 2],
		]);
		expect(Children.map(children, (child) => child)).toHaveLength(2);
	});

	// Per ReactChildren-test.js:165.
	it('should traverse children of different kinds', () => {
		const div = createElement('div', { key: 'div' });
		const span = createElement('span', { key: 'span' });
		const children = [div, [[span]], 'string', 1234, true, false, null, undefined, 9n];
		const seen: any[] = [];
		Children.forEach(children, (child) => seen.push(child));
		expect(seen).toEqual([div, span, 'string', 1234, null, null, null, null, 9n]);
		expect(Children.toArray(children).map((child: any) => child.type ?? child)).toEqual([
			'div',
			'span',
			'string',
			1234,
			9n,
		]);
	});

	// Per ReactChildren-test.js:225.
	it('should be called for each child in nested structure', () => {
		const a = createElement('i', { key: 'a' });
		const b = createElement('i', { key: 'b' });
		const c = createElement('i', { key: 'c' });
		const seen: any[] = [];
		Children.forEach(
			[
				[a, null, b],
				[null, c],
			],
			(child, index) => seen.push([child, index]),
		);
		expect(seen).toEqual([
			[a, 0],
			[null, 1],
			[b, 2],
			[null, 3],
			[c, 4],
		]);
	});

	// Per ReactChildren-test.js:268.
	it('should retain key across two mappings', () => {
		const children = [createElement('div', { key: 'zero' }), createElement('div', { key: 'one' })];
		const once = Children.map(children, (child) => child)! as any[];
		const twice = Children.map(once, (child) => child)! as any[];
		expect(once.map((child) => child.key)).toEqual(['.$zero', '.$one']);
		expect(twice.map((child) => child.key)).toEqual(['.$.$zero', '.$.$one']);
	});

	// Per ReactChildren-test.js:305.
	it('should be called for each child in an iterable without keys', () => {
		const children = [createElement('div'), createElement('div'), createElement('div')];
		const seen: any[] = [];
		const mapped = Children.map(valuesIterable(children), (child, index) => {
			seen.push([child, index]);
			return child;
		})! as any[];
		expect(seen).toEqual(children.map((child, index) => [child, index]));
		expect(mapped.map((child) => child.key)).toEqual(['.0', '.1', '.2']);
	});

	// Per ReactChildren-test.js:366.
	it('should be called for each child in an iterable with keys', () => {
		const children = [1, 2, 3].map((n) => createElement('div', { key: '#' + n }));
		const mapped = Children.map(valuesIterable(children), (child) => child)! as any[];
		expect(mapped.map((child) => child.key)).toEqual(['.$#1', '.$#2', '.$#3']);
	});

	// Per ReactChildren-test.js:414 and ReactElementValidator-test.internal.js:459.
	it('should not enumerate enumerable numbers (#4776)', () => {
		const prototype = Number.prototype as any;
		prototype['@@iterator'] = () => {
			throw new Error('number iterator called');
		};
		try {
			expect(Children.toArray([5, 12, 13])).toEqual([5, 12, 13]);
		} finally {
			delete prototype['@@iterator'];
		}
	});

	// Per ReactChildren-test.js:459.
	it('should allow extension of native prototypes', () => {
		(String.prototype as any).key = 'octane';
		(Number.prototype as any).key = 'rocks';
		try {
			expect(Children.toArray(['a', 13])).toEqual(['a', 13]);
		} finally {
			delete (String.prototype as any).key;
			delete (Number.prototype as any).key;
		}
	});

	// Per ReactChildren-test.js:414. React only treats objects as iterable
	// child collections; a function remains a non-renderable child even when
	// userland attaches an iterator to it.
	it('does not traverse callable iterables', () => {
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

	// Per ReactChildren-test.js:500.
	it('should pass key to returned component', () => {
		const child = createElement('span', { key: 'simple' });
		const mapped = Children.map(child, (value) => createElement('div', null, value))! as any[];
		expect(mapped[0].key).toBe('.$simple');
		expect(mapped[0].props.children).toBe(child);
	});

	// Per ReactChildren-test.js:516.
	it('should invoke callback with the right context', () => {
		const context = { label: 'scope' };
		const values: any[] = [];
		Children.forEach(
			[1, 2],
			function (this: any, child) {
				values.push([this, child]);
			},
			context,
		);
		expect(values).toEqual([
			[context, 1],
			[context, 2],
		]);
	});

	// Per ReactChildren-test.js:541.
	it('should be called for each child in array', () => {
		const original = [
			createElement('div', { key: 'keyZero' }),
			null,
			createElement('div', { key: 'keyTwo' }),
			null,
			createElement('div', { key: 'keyFour' }),
		];
		const replacements = [
			createElement('div', { key: 'giraffe' }),
			null,
			createElement('div'),
			createElement('span'),
			createElement('div', { key: 'keyFour' }),
		];
		const mapped = Children.map(original, (_child, index) => replacements[index])! as any[];
		expect(mapped.map((child) => child.key)).toEqual([
			'giraffe/.$keyZero',
			'.$keyTwo',
			'.3',
			'.$keyFour',
		]);
	});

	// Per ReactChildren-test.js:603.
	it('should be called for each child in nested structure with mapping', () => {
		const zero = createElement('div', { key: 'keyZero' });
		const two = createElement('div', { key: 'keyTwo' });
		const four = createElement('div', { key: 'keyFour' });
		const five = createElement('div', { key: 'keyFive' });
		const mapped = Children.map([[[zero, null, two], [null, four], five]], (child) => {
			if (child === zero) return createElement('div', { key: 'giraffe' });
			if (child === two || child === five) return createElement('div');
			return child;
		})! as any[];
		expect(mapped.map((child) => child.key)).toEqual([
			'giraffe/.0:0:$keyZero',
			'.0:0:$keyTwo',
			'.0:1:$keyFour',
			'.0:$keyFive',
		]);
	});

	// Per ReactChildren-test.js:676.
	it('should retain key across two mappings with conditions', () => {
		const children = [
			createElement('div', { key: 'keyZero' }),
			createElement('div', { key: 'keyOne' }),
		];
		const first = Children.map(children, (_child, index) =>
			index === 0 ? createElement('div', { key: 'giraffe' }) : createElement('div'),
		)! as any[];
		const second = Children.map(first, (_child, index) =>
			index === 0 ? createElement('div', { key: 'giraffe' }) : createElement('div'),
		)! as any[];
		expect(first.map((child) => child.key)).toEqual(['giraffe/.$keyZero', '.$keyOne']);
		expect(second.map((child) => child.key)).toEqual(['giraffe/.$giraffe/.$keyZero', '.$.$keyOne']);
	});

	// Per ReactChildren-test.js:717.
	it('should not throw if key provided is a dupe with array key', () => {
		expect(() =>
			Children.map([createElement('div'), createElement('div', { key: '0' })], () => null),
		).not.toThrow();
	});

	// Per ReactChildren-test.js:737.
	it('should use the same key for a cloned element', () => {
		const child = createElement('div');
		const mapped = Children.map(child, (value) => value)! as any[];
		const cloned = Children.map(child, (value) => cloneElement(value))! as any[];
		expect(mapped[0].key).toBe(cloned[0].key);
	});

	// Per ReactChildren-test.js:757.
	it('should use the same key for a cloned element with key', () => {
		const child = createElement('div', { key: 'unique' });
		const mapped = Children.map(child, (value) => value)! as any[];
		const cloned = Children.map(child, (value) => cloneElement(value, { key: 'unique' }))! as any[];
		expect(mapped[0].key).toBe(cloned[0].key);
	});

	// Per ReactChildren-test.js:777.
	it('should return 0 for null children', () => {
		expect(Children.count(null)).toBe(0);
	});

	// Per ReactChildren-test.js:782.
	it('should return 0 for undefined children', () => {
		expect(Children.count(undefined)).toBe(0);
	});

	// Per ReactChildren-test.js:787.
	it('should return 1 for single child', () => {
		expect(Children.count(createElement('span'))).toBe(1);
	});

	// Per ReactChildren-test.js:794.
	it('should count the number of children in flat structure', () => {
		expect(Children.count([createElement('div'), null, createElement('div'), null])).toBe(4);
	});

	// Per ReactChildren-test.js:814.
	it('should count the number of children in nested structure', () => {
		expect(Children.count([[[createElement('div'), null], [createElement('div')]], null])).toBe(4);
	});

	// Per ReactChildren-test.js:829.
	it('should flatten children to an array', () => {
		const flattened = Children.toArray([
			[createElement('div', { key: 'apple' }), createElement('div', { key: 'banana' })],
			[createElement('div', { key: 'banana' }), createElement('div', { key: 'deli' })],
		]) as any[];
		expect(flattened).toHaveLength(4);
		expect(flattened[1].key).toContain('banana');
		expect(flattened[2].key).toContain('banana');
		expect(flattened[1].key).not.toBe(flattened[2].key);
		expect(Children.toArray([1, 'two', null, undefined, true])).toEqual([1, 'two']);
	});

	// Per ReactChildren-test.js:895, :944, :987 and :1197. Static siblings are
	// passed positionally, so React and Octane both treat them as already valid.
	it('does not warn for mapped static children without keys', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const parent = createElement('div', null, createElement('i'), createElement('b'));
		const mapped = Children.map(parent.props.children, (child) =>
			createElement('span', null, child),
		);
		const result = mount(RenderValue as any, { value: mapped });
		expect(warn.mock.calls.some((call) => String(call[0]).includes('unique "key"'))).toBe(false);
		result.unmount();
		warn.mockRestore();
	});

	// Per ReactChildren-test.js:944.
	it('does not warn for cloned static children without keys', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const parent = createElement('div', null, createElement('i'), createElement('b'));
		const cloned = Children.map(parent.props.children, (child) => cloneElement(child));
		const result = mount(RenderValue as any, { value: cloned });
		expect(warn.mock.calls.some((call) => String(call[0]).includes('unique "key"'))).toBe(false);
		result.unmount();
		warn.mockRestore();
	});

	// Per ReactChildren-test.js:987.
	it('does not warn for flattened static children without keys', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const parent = createElement('div', null, createElement('i'), createElement('b'));
		const flattened = Children.toArray(parent.props.children);
		const result = mount(RenderValue as any, { value: flattened });
		expect(warn.mock.calls.some((call) => String(call[0]).includes('unique "key"'))).toBe(false);
		result.unmount();
		warn.mockRestore();
	});

	// Per ReactChildren-test.js:1197.
	it('does not warn when there are keys on elements in a fragment', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const result = mount(RenderValue as any, {
			value: [createElement('div', { key: 'foo' }), createElement('div', { key: 'bar' })],
		});
		expect(warn.mock.calls.some((call) => String(call[0]).includes('unique "key"'))).toBe(false);
		result.unmount();
		warn.mockRestore();
	});

	// Per ReactChildren-test.js:866. Octane intentionally emits framework-native
	// wording rather than React owner stacks.
	it('warns for mapped list children without keys', () => {
		const warnings = missingKeyWarnings(() => {
			const mapped = Children.map([createElement('i')], () => createElement('b'));
			const result = mount(RenderValue as any, { value: createElement('main', null, mapped) });
			result.unmount();
		});
		expect(warnings).toHaveLength(1);
	});

	// Per ReactChildren-test.js:918.
	it('warns for cloned list children without keys', () => {
		const warnings = missingKeyWarnings(() => {
			const cloned = Children.map([createElement('i')], (child) => cloneElement(child));
			const result = mount(RenderValue as any, { value: cloned });
			result.unmount();
		});
		expect(warnings).toHaveLength(1);
	});

	// Per ReactChildren-test.js:965.
	it('warns for flattened list children without keys', () => {
		const warnings = missingKeyWarnings(() => {
			const flattened = Children.toArray([createElement('i')]);
			const result = mount(RenderValue as any, { value: flattened });
			result.unmount();
		});
		expect(warnings).toHaveLength(1);
	});

	// Per ReactChildren-test.js:1176. React's source component is a class only
	// because that is how the test observes its returned array; the portable
	// contract is covered with an Octane function component.
	it('warns for keys for arrays of elements in a fragment', () => {
		function ComponentReturningArray(): any {
			return [createElement('i'), createElement('b')];
		}
		const warnings = missingKeyWarnings(() => {
			const result = mount(ComponentReturningArray);
			result.unmount();
		});
		expect(warnings).toHaveLength(1);
	});

	// Per ReactChildren-test.js:1211.
	it('warns for keys for arrays at the top level', () => {
		const warnings = missingKeyWarnings(() => {
			const container = document.createElement('div');
			document.body.appendChild(container);
			const root = createRoot(container);
			try {
				root.render([createElement('i'), createElement('b')] as any);
				flushSync(() => {});
			} finally {
				root.unmount();
				container.remove();
			}
		});
		expect(warnings).toHaveLength(1);
	});

	// A mapped element with no source key should warn until the consumer gives
	// it a real key. React.cloneElement treats that override as resolving the
	// validation failure rather than carrying the old provenance forever.
	it('does not warn after an explicit clone key fixes a mapped child', () => {
		const warnings = missingKeyWarnings(() => {
			const mapped = Children.toArray([createElement('i')])[0];
			const fixed = cloneElement(mapped, { key: 'fixed' });
			const result = mount(RenderValue as any, { value: [fixed] });
			result.unmount();
		});
		expect(warnings).toEqual([]);
	});

	// Per ReactChildren-test.js:1004. Octane descriptors never depend on React's
	// development-only `_store`, including after freezing and key rebasing.
	it('does not throw on children without `_store`', () => {
		const child = createElement('div');
		expect('_store' in (child as any)).toBe(false);
		expect(() => Children.toArray([child])).not.toThrow();
	});

	// Per ReactChildren-test.js:1029.
	it('should escape keys', () => {
		const mapped = Children.map(
			[createElement('div', { key: '1' }), createElement('div', { key: '1=::=2' })],
			(child) => child,
		)! as any[];
		expect(mapped.map((child) => child.key)).toEqual(['.$1', '.$1=0=2=2=02']);
	});

	// Per ReactChildren-test.js:1048.
	it('should combine keys when map returns an array', () => {
		const mapped = Children.map(
			[createElement('div', { key: 'a' }), false, createElement('p')],
			(child) => [
				createElement('span', { key: 'x' }),
				null,
				child,
				child && cloneElement(child, { key: 'z' }),
				createElement('hr'),
			],
		)! as any[];
		expect(mapped.map((child) => child.key)).toEqual([
			'.$a/.$x',
			'.$a/.$a',
			'.$a/.$z',
			'.$a/.4',
			'.1/.$x',
			'.1/.4',
			'.2/.$x',
			'.2/.2',
			'.2/.$z',
			'.2/.4',
		]);
	});

	// Per ReactChildren-test.js:1116.
	it('should throw on object', () => {
		expect(() => Children.forEach({ a: 1, b: 2 }, () => {})).toThrow(/object with keys \{a, b\}/);
	});

	// Per ReactChildren-test.js:1129. React's lazy node is an object; Octane's
	// lazy value is a callable component, so the equivalent public element is a
	// descriptor for that wrapper. Both suspend before Children.map can clone it.
	it('should render React.lazy after suspending', async () => {
		const module = deferred<{ default: typeof LazyChild }>();
		const Lazy = lazy(() => module.promise);
		const result = mount(LazyChildrenHost, { component: Lazy });
		expect(result.find('.children-pending').textContent).toBe('Loading...');
		await act(() => module.resolve({ default: LazyChild }));
		expect(result.find('.lazy-child').textContent).toBe('hi');
		result.unmount();
	});

	// Per ReactChildren-test.js:1145.
	it('should render cached Promises after suspending', async () => {
		const value = deferred<any>();
		const result = mount(PromiseChildrenHost, { value: value.promise });
		expect(result.find('.children-pending').textContent).toBe('Loading...');
		await act(() => value.resolve(createElement('div', { key: 'hi' }, 'before')));
		expect(result.find('div').textContent).toBe('hi');
		result.unmount();
	});

	// Per ReactChildren-test.js:1161.
	it('should throw on regex', () => {
		expect(() => Children.forEach(/abc/, () => {})).toThrow(/\/abc\//);
	});

	// Per onlyChild-test.js:29.
	it('should fail when passed two children', () => {
		expect(() => Children.only([createElement('div'), createElement('span')])).toThrow(
			/single element child/,
		);
	});

	// Per onlyChild-test.js:41.
	it('should fail when passed nully values', () => {
		expect(() => Children.only(null)).toThrow(/single element child/);
		expect(() => Children.only(undefined)).toThrow(/single element child/);
	});

	// Per onlyChild-test.js:53. An array remains a collection even when it has
	// one keyed element; callers must pass the element itself.
	it('should fail when key/value objects', () => {
		expect(() => Children.only([createElement('span', { key: 'abc' })])).toThrow(
			/single element child/,
		);
	});

	// Per onlyChild-test.js:60.
	it('should not fail when passed interpolated single child', () => {
		const child = createElement('span');
		expect(() => Children.only(child)).not.toThrow();
	});

	// Per onlyChild-test.js:67.
	it('should return the only child', () => {
		const child = createElement('span');
		expect(Children.only(child)).toBe(child);
	});
});

describe('ReactCreateElement public behavior', () => {
	function Component(_props: any): null {
		return null;
	}

	// Per ReactCreateElement-test.js:42 and :98.
	it('returns a complete element according to spec', () => {
		const element = createElement(Component);
		expect(element.type).toBe(Component);
		expect(element.key).toBe(null);
		expect(element.ref).toBe(null);
		expect(element.props).toEqual({});
		expect(isValidElement(element)).toBe(true);
		expect(Object.isFrozen(element)).toBe(true);
		expect(Object.isFrozen(element.props)).toBe(true);
	});

	// Per ReactCreateElement-test.js:98.
	it('allows a string to be passed as the type', () => {
		const element = createElement('div');
		expect(element).toMatchObject({ type: 'div', key: null, ref: null, props: {} });
	});

	// Per ReactCreateElement-test.js:110, :348 and :380.
	it('returns an immutable element', () => {
		const element = createElement('div', { className: 'before' });
		expect(() => ((element as any).type = 'span')).toThrow();
		expect(() => ((element.props as any).className = 'after')).toThrow();
		expect(() => ((element.props as any).added = true)).toThrow();
	});

	// Per ReactCreateElement-test.js:119.
	it('does not reuse the original config object', () => {
		const config = { foo: 1 };
		const element = createElement(Component, config);
		config.foo = 2;
		expect(element.props.foo).toBe(1);
		expect(element.props).not.toBe(config);
	});

	// Per ReactCreateElement-test.js:127.
	it('does not fail if config has no prototype', () => {
		const config = Object.create(null, { foo: { value: 1, enumerable: true } });
		expect(createElement(Component, config).props.foo).toBe(1);
	});

	// Per ReactCreateElement-test.js:133.
	it('extracts key from the rest of the props', () => {
		const element = createElement(Component, { key: '12', foo: '56' } as any);
		expect(element.key).toBe('12');
		expect(element.props).toEqual({ foo: '56' });
	});

	// Per ReactCreateElement-test.js:145.
	it('does not extract ref from the rest of the props', () => {
		const ref = { current: null };
		const element = createElement(Component, { key: '12', ref, foo: '56' } as any);
		expect(element.ref).toBe(ref);
		expect(element.props).toEqual({ ref, foo: '56' });
	});

	// Per ReactCreateElement-test.js:169.
	it('extracts null key', () => {
		const element = createElement(Component, { key: null, foo: '12' } as any);
		expect(element.key).toBe('null');
		expect(element.props).toEqual({ foo: '12' });
	});

	// Per ReactCreateElement-test.js:183.
	it('ignores undefined key and ref', () => {
		const element = createElement(Component, { key: undefined, ref: undefined, foo: '56' } as any);
		expect(element.key).toBe(null);
		expect(element.ref).toBe(null);
		expect(element.props.foo).toBe('56');
	});

	// Per ReactCreateElement-test.js:200.
	it('ignores key and ref warning getters', () => {
		const props: any = {};
		const keyGetter: any = () => undefined;
		keyGetter.isReactWarning = true;
		const refGetter: any = () => undefined;
		refGetter.isReactWarning = true;
		Object.defineProperty(props, 'key', { enumerable: false, get: keyGetter });
		Object.defineProperty(props, 'ref', { enumerable: false, get: refGetter });
		const element = createElement('div', props);
		expect(element.key).toBe(null);
		expect(element.ref).toBe(null);
	});

	// Per ReactCreateElement-test.js:207.
	it('coerces the key to a string', () => {
		expect(createElement(Component, { key: 12 } as any).key).toBe('12');
	});

	// Per ReactCreateElement-test.js:244.
	it('merges an additional argument onto the children prop', () => {
		expect(createElement(Component, { children: 'text' } as any, 1).props.children).toBe(1);
		expect(
			createElement(Component, { children: 'text' } as any, undefined).props.children,
		).toBeUndefined();
	});

	// Per ReactCreateElement-test.js:256.
	it('does not override children if no rest args are provided', () => {
		expect(createElement(Component, { children: 'text' } as any).props.children).toBe('text');
	});

	// Per ReactCreateElement-test.js:263.
	it('overrides children if null is provided as an argument', () => {
		expect(createElement(Component, { children: 'text' } as any, null).props.children).toBe(null);
	});

	// Per ReactCreateElement-test.js:274.
	it('merges rest arguments onto the children prop in an array', () => {
		const children = createElement(Component, null as any, 1, 2, 3).props.children as any[];
		expect(children).toEqual([1, 2, 3]);
		expect(Object.isFrozen(children)).toBe(true);
	});

	// Per ReactCreateElement-test.js:282.
	it('allows static methods to be called using the type property', () => {
		(Component as any).answer = () => 42;
		expect((createElement(Component).type as any).answer()).toBe(42);
	});

	// Per ReactCreateElement-test.js:294.
	it('is indistinguishable from a plain object', () => {
		expect(createElement('div').constructor).toBe({}.constructor);
	});

	// Per ReactCreateElement-test.js:300 and :324. Octane has no class components;
	// the same public defaultProps normalization is exercised with a function.
	it('should normalize props with default values', () => {
		(Component as any).defaultProps = { fruit: 'persimmon', nullable: 'default' };
		try {
			expect(createElement(Component).props).toMatchObject({
				fruit: 'persimmon',
				nullable: 'default',
			});
			expect(
				createElement(Component, { fruit: 'mango', nullable: null } as any).props,
			).toMatchObject({
				fruit: 'mango',
				nullable: null,
			});
			expect(createElement(Component, { fruit: undefined } as any).props.fruit).toBe('persimmon');
		} finally {
			delete (Component as any).defaultProps;
		}
	});

	// Per ReactCreateElement-test.js:300. The class-instance update in React is
	// class-specific; Octane preserves the public removal/defaulting contract on
	// each function-component element creation.
	it('should use default prop value when removing a prop', () => {
		function Fruit(props: { fruit?: string }): any {
			return createElement('span', { className: 'fruit' }, String(props.fruit));
		}
		function FruitHost(props: { childProps: { fruit?: string } }): any {
			return createElement(Fruit, props.childProps);
		}
		(Fruit as any).defaultProps = { fruit: 'persimmon' };
		try {
			const result = mount(FruitHost, { childProps: { fruit: 'mango' } });
			expect(result.find('.fruit').textContent).toBe('mango');
			result.update(FruitHost, { childProps: {} });
			expect(result.find('.fruit').textContent).toBe('persimmon');
			result.unmount();
		} finally {
			delete (Fruit as any).defaultProps;
		}
	});

	// Per ReactCreateElement-test.js:348.
	it('throws when changing a prop (in dev) after element creation', () => {
		const element = createElement('div', { className: 'moo' });
		expect(() => ((element.props as any).className = 'quack')).toThrow();
		expect(element.props.className).toBe('moo');
	});

	// Per ReactCreateElement-test.js:380.
	it('throws when adding a prop (in dev) after element creation', () => {
		const element = createElement('div');
		expect(() => ((element.props as any).className = 'quack')).toThrow();
		expect((element.props as any).className).toBe(undefined);
	});

	// Per ReactCreateElement-test.js:412.
	it('does not warn for NaN props', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(createElement(Component, { value: Number.NaN } as any).props.value).toBeNaN();
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});
});

describe('ReactElementClone public behavior', () => {
	function Composite(props: any): any {
		return createElement('div', { className: props.className, ref: props.ref }, props.children);
	}

	// Per ReactElementClone-test.js:37.
	it('should clone a DOM component with new props', () => {
		const clone = cloneElement(createElement('div', { className: 'child' }), { className: 'xyz' });
		const result = mount(RenderValue as any, { value: clone });
		expect(result.find('div').className).toBe('xyz');
		result.unmount();
	});

	// Per ReactElementClone-test.js:65.
	it('should clone a composite component with new props', () => {
		const clone = cloneElement(createElement(Composite, { className: 'child' }), {
			className: 'xyz',
		});
		const result = mount(RenderValue as any, { value: clone });
		expect(result.find('div').className).toBe('xyz');
		result.unmount();
	});

	// Per ReactElementClone-test.js:95.
	it('does not fail if config has no prototype', () => {
		const config = Object.create(null, { foo: { value: 1, enumerable: true } });
		expect(cloneElement(createElement('div'), config).props.foo).toBe(1);
	});

	// Per ReactElementClone-test.js:100.
	it('should keep the original ref if it is not overridden', () => {
		const ref = { current: null as Element | null };
		const clone = cloneElement(createElement('div', { ref }), { className: 'xyz' });
		const result = mount(RenderValue as any, { value: clone });
		expect(ref.current).toBe(result.find('div'));
		result.unmount();
	});

	// Per ReactElementClone-test.js:130.
	it('should transfer the key property', () => {
		expect(cloneElement(createElement(Composite), { key: 'xyz' }).key).toBe('xyz');
	});

	// Per ReactElementClone-test.js:140 and :154.
	it('should transfer children', () => {
		const child = createElement('span', null, 'xyz');
		const original = createElement(Composite, null as any, child);
		const clone = cloneElement(original, {});
		expect(clone.props.children).toBe(child);
		expect(cloneElement(original, { children: 'next' }).props.children).toBe('next');
	});

	// Per ReactElementClone-test.js:154.
	it('should shallow clone children', () => {
		const child = createElement('span', null, 'xyz');
		const clone = cloneElement(createElement(Composite, null as any, child), {});
		expect(clone.props.children).toBe(child);
	});

	// Per ReactElementClone-test.js:168.
	it('should accept children as rest arguments', () => {
		const clone = cloneElement(
			createElement(Composite, null as any, 'old'),
			{ children: 'config' },
			createElement('div'),
			createElement('span'),
		);
		expect(clone.props.children).toHaveLength(2);
		expect(clone.props.children.map((child: any) => child.type)).toEqual(['div', 'span']);
		expect(Object.isFrozen(clone.props.children)).toBe(false);
		clone.props.children.push(createElement('i'));
		expect(clone.props.children.map((child: any) => child.type)).toEqual(['div', 'span', 'i']);
	});

	// Per ReactElementClone-test.js:185.
	it('should override children if undefined is provided as an argument', () => {
		const original = createElement(Composite, { children: 'text' } as any);
		expect(cloneElement(original, {}, undefined).props.children).toBe(undefined);
	});

	// Per ReactElementClone-test.js:205.
	it('should support keys and refs', () => {
		const ref = { current: null as Element | null };
		const clone = cloneElement(createElement('span', { key: 'abc' }), { key: 'xyz', ref });
		const result = mount(RenderValue as any, { value: clone });
		expect(clone.key).toBe('xyz');
		expect(clone.props.ref).toBe(ref);
		expect(ref.current).toBe(result.find('span'));
		result.unmount();
	});

	// Per ReactElementClone-test.js:242.
	it('should steal the ref if a new ref is specified', () => {
		const oldRef = { current: null as Element | null };
		const nextRef = { current: null as Element | null };
		const clone = cloneElement(createElement('span', { ref: oldRef }), { ref: nextRef });
		const result = mount(RenderValue as any, { value: clone });
		expect(oldRef.current).toBe(null);
		expect(nextRef.current).toBe(result.find('span'));
		result.unmount();
	});

	// Per ReactElementClone-test.js:278.
	it('should overwrite props', () => {
		expect(
			cloneElement(createElement(Composite, { myprop: 'abc' }), { myprop: 'xyz' }).props.myprop,
		).toBe('xyz');
	});

	// Per ReactElementClone-test.js:306.
	it('does not warns for arrays of elements with keys', () => {
		const warnings = missingKeyWarnings(() => {
			const clone = cloneElement(createElement('div'), null, [
				createElement('div', { key: '#1' }),
				createElement('div', { key: '#2' }),
			]);
			const result = mount(RenderValue as any, { value: clone });
			result.unmount();
		});
		expect(warnings).toEqual([]);
	});

	// Per ReactElementClone-test.js:315.
	it('does not warn when the element is directly in rest args', () => {
		const warnings = missingKeyWarnings(() => {
			const clone = cloneElement(
				createElement('div'),
				null,
				createElement('i'),
				createElement('b'),
			);
			const result = mount(RenderValue as any, { value: clone });
			result.unmount();
		});
		expect(warnings).toEqual([]);
	});

	// Per ReactElementClone-test.js:322.
	it('does not warn when the array contains a non-element', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		cloneElement(createElement('div'), null, [{}, {}]);
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	// Per ReactElementClone-test.js:294.
	it('warns for keys for arrays of elements in rest args', () => {
		const warnings = missingKeyWarnings(() => {
			const clone = cloneElement(createElement('div'), null, [
				createElement('i'),
				createElement('b'),
			]);
			const result = mount(RenderValue as any, { value: clone });
			result.unmount();
		});
		expect(warnings).toHaveLength(1);
	});

	// Per ReactElementClone-test.js:326.
	it('should ignore key and ref warning getters', () => {
		const base = createElement('div');
		const clone = cloneElement(base, base.props);
		expect(clone.key).toBe(null);
		expect(clone.ref).toBe(null);
	});

	// Per ReactElementClone-test.js:333.
	it('should ignore undefined key and ref', () => {
		const ref = { current: null };
		const base = createElement(Composite, { key: '12', ref, foo: '56' } as any);
		const clone = cloneElement(base, { key: undefined, ref: undefined, foo: 'ef' });
		expect(clone.key).toBe('12');
		expect(clone.ref).toBe(ref);
		expect(clone.props).toMatchObject({ foo: 'ef', ref });
	});

	// Per ReactElementClone-test.js:366.
	it('should extract null key and ref', () => {
		const base = createElement(Composite, { key: '12', ref: '34', foo: '56' } as any);
		const clone = cloneElement(base, { key: null, ref: null, foo: 'ef' });
		expect(clone.key).toBe('null');
		expect(clone.ref).toBe(null);
		expect(clone.props).toMatchObject({ foo: 'ef', ref: null });
	});

	// Per ReactElementClone-test.js:388 and :395.
	it('throws an error if passed null', () => {
		expect(() => cloneElement(null as any)).toThrow(/must be an element/);
		expect(() => cloneElement(undefined as any)).toThrow(/must be an element/);
	});

	// Per ReactElementClone-test.js:395.
	it('throws an error if passed undefined', () => {
		expect(() => cloneElement(undefined as any)).toThrow(/must be an element/);
	});
});

describe('ReactElementValidator portable outcomes', () => {
	// Per ReactElementValidator-test.internal.js:39. The React source uses a
	// class only as a child passthrough; an Octane function covers the public
	// createElement/rest-children behavior without adding class semantics.
	it('warns for keys for arrays of elements in rest args', () => {
		function Passthrough(props: { children?: any }): any {
			return props.children;
		}
		const warnings = missingKeyWarnings(() => {
			const value = createElement(Passthrough, null as any, [
				createElement('i'),
				createElement('b'),
			]);
			const result = mount(RenderValue as any, { value });
			result.unmount();
		});
		expect(warnings).toHaveLength(1);
	});

	// Per ReactElementValidator-test.internal.js:166.
	it('warns for keys for iterables of elements in rest args', () => {
		const warnings = missingKeyWarnings(() => {
			const result = mount(RenderValue as any, {
				value: valuesIterable([createElement('i'), createElement('b')]),
			});
			result.unmount();
		});
		expect(warnings).toHaveLength(1);
	});

	// Per ReactElementValidator-test.internal.js:145.
	it('does not warn for keys when passing children down', () => {
		const warnings = missingKeyWarnings(() => {
			const value = createElement('div', null, createElement('span'), createElement('span'));
			const result = mount(RenderValue as any, { value });
			result.unmount();
		});
		expect(warnings).toEqual([]);
	});

	// Per ReactElementValidator-test.internal.js:194.
	it('does not warns for arrays of elements with keys', () => {
		const warnings = missingKeyWarnings(() => {
			const value = createElement('div', null, [
				createElement('i', { key: '1' }),
				createElement('i', { key: '2' }),
			]);
			const result = mount(RenderValue as any, { value });
			result.unmount();
		});
		expect(warnings).toEqual([]);
	});

	// Per ReactElementValidator-test.internal.js:201.
	it('does not warns for iterable elements with keys', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		createElement(
			'div',
			null,
			valuesIterable([createElement('i', { key: '1' }), createElement('i', { key: '2' })]),
		);
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	// Per ReactElementValidator-test.internal.js:222.
	it('does not warn when the element is directly in rest args', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		createElement('div', null, createElement('i'), createElement('b'));
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	// Per ReactElementValidator-test.internal.js:231.
	it('does not warn when the array contains a non-element', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		createElement('div', null, [{}, {}]);
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	// Per ReactElementValidator-test.internal.js:500. Octane lazy values are
	// callable component wrappers; creating their descriptor must stay lazy.
	it('does not call lazy initializers eagerly', async () => {
		const { lazy } = await import('octane');
		let called = false;
		const Lazy = lazy(() => {
			called = true;
			return new Promise(() => {});
		});
		createElement(Lazy);
		expect(called).toBe(false);
	});

	// Per ReactElementValidator-test.internal.js:510. Octane's compiler uses
	// createElement as its modern value-position target, so these remain props.
	it('__self and __source are treated as normal props', () => {
		const element = createElement('div', { __self: 'Hello ', __source: 'world!' } as any);
		expect(element.props.__self + element.props.__source).toBe('Hello world!');
	});
});
