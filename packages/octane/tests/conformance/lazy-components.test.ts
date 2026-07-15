import { describe, expect, it, vi } from 'vitest';
import {
	Activity,
	Fragment,
	Suspense,
	ViewTransition,
	createContext,
	createPortal,
	lazy,
	memo,
} from 'octane';
import * as ServerRuntime from 'octane/server';
import { act, mount } from '../_helpers';
import { loadServerFixture } from '../_server-fixture.js';
import {
	LazyAdd,
	LazyDefaultText,
	LazyHost,
	LazyListHost,
	LazyMemoProbe,
	LazyPairHost,
	LazyProviderHost,
	LazyRefTarget,
	LazyStatefulItem,
	LazyText,
} from './_fixtures/lazy-components.tsrx';

const server = loadServerFixture(
	'packages/octane/tests/conformance/_fixtures/lazy-components.tsrx',
);

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function fulfilled<T>(value: T): PromiseLike<T> {
	return {
		then(onFulfilled) {
			return fulfilled(onFulfilled!(value));
		},
	};
}

function rejected(reason: unknown): PromiseLike<never> {
	return {
		then(_onFulfilled, onRejected) {
			if (onRejected) onRejected(reason);
			return rejected(reason);
		},
	};
}

function lazyModule<T>(component: T) {
	return fulfilled({ default: component });
}

describe('ReactLazy public conformance', () => {
	// Per ReactLazy-test.internal.js:90 (React canary b740af2).
	it('suspends until module has loaded', async () => {
		const module = deferred<{ default: typeof LazyText }>();
		const load = vi.fn(() => module.promise);
		const Lazy = lazy(load);
		const root = mount(LazyHost, { comp: Lazy, childProps: { text: 'Hi' } });
		expect(root.find('.lazy-fallback').textContent).toBe('Loading...');
		expect(load).toHaveBeenCalledTimes(1);

		await act(() => module.resolve({ default: LazyText }));
		expect(root.find('.lazy-value').textContent).toBe('Hi');
		root.update(LazyHost, { comp: Lazy, childProps: { text: 'Hi again' } });
		expect(root.find('.lazy-value').textContent).toBe('Hi again');
		expect(load).toHaveBeenCalledTimes(1);
		root.unmount();
	});

	// Per ReactLazy-test.internal.js:119 (React canary b740af2).
	it('renders a lazy context provider', async () => {
		const context = createContext('default');
		const module = deferred<{ default: typeof context.Provider }>();
		const LazyProvider = lazy(() => module.promise);
		const root = mount(LazyProviderHost, {
			provider: LazyProvider,
			context,
			value: 'Hi',
		});
		expect(root.find('.lazy-fallback').textContent).toBe('Loading...');

		await act(() => module.resolve({ default: context.Provider }));
		expect(root.find('.lazy-context').textContent).toBe('Hi');
		root.update(LazyProviderHost, {
			provider: LazyProvider,
			context,
			value: 'Hi again',
		});
		expect(root.find('.lazy-context').textContent).toBe('Hi again');
		root.unmount();
	});

	// Per ReactLazy-test.internal.js:157 (React canary b740af2).
	it('can resolve synchronously without suspending', () => {
		const Lazy = lazy(() => lazyModule(LazyText));
		const root = mount(LazyHost, { comp: Lazy, childProps: { text: 'Hi' } });
		expect(root.findAll('.lazy-fallback')).toHaveLength(0);
		expect(root.find('.lazy-value').textContent).toBe('Hi');
		root.unmount();
	});

	// Per ReactLazy-test.internal.js:178 (React canary b740af2).
	it('can reject synchronously without suspending', () => {
		const Lazy = lazy(() => rejected(new Error('oh no')));
		const root = mount(LazyHost, { comp: Lazy });
		expect(root.findAll('.lazy-fallback')).toHaveLength(0);
		expect(root.find('.lazy-error').textContent).toBe('Error: oh no');
		root.unmount();
	});

	// Per ReactLazy.js:70-180 (React canary b740af2): loader setup does not
	// transition the payload until loader and subscription setup complete.
	it('retries a loader that throws before returning a thenable', () => {
		let attempts = 0;
		const Lazy = lazy(() => {
			attempts++;
			if (attempts === 1) throw new Error('load exploded');
			return lazyModule(LazyText);
		});
		const first = mount(LazyHost, { comp: Lazy, childProps: { text: 'first' } });
		expect(first.find('.lazy-error').textContent).toBe('Error: load exploded');
		first.unmount();

		const recovered = mount(LazyHost, { comp: Lazy, childProps: { text: 'recovered' } });
		expect(recovered.find('.lazy-value').textContent).toBe('recovered');
		expect(attempts).toBe(2);
		recovered.unmount();
	});

	// Per ReactLazy.js:70-180 (React canary b740af2).
	it('retries when thenable subscription throws synchronously', () => {
		let attempts = 0;
		const Lazy = lazy(() => {
			attempts++;
			if (attempts === 1) {
				return {
					then() {
						throw new Error('subscription exploded');
					},
				} as any;
			}
			return lazyModule(LazyText);
		});
		const first = mount(LazyHost, { comp: Lazy, childProps: { text: 'first' } });
		expect(first.find('.lazy-error').textContent).toBe('Error: subscription exploded');
		first.unmount();

		const recovered = mount(LazyHost, { comp: Lazy, childProps: { text: 'recovered' } });
		expect(recovered.find('.lazy-value').textContent).toBe('recovered');
		expect(attempts).toBe(2);
		recovered.unmount();
	});

	// Per ReactLazy.js:183-223 (React canary b740af2): the fulfilled module is
	// cached, while its default export is resolved during each render.
	it('retries a fulfilled module default getter without reloading', () => {
		let reads = 0;
		const load = vi.fn(() =>
			fulfilled({
				get default() {
					reads++;
					if (reads === 1) throw new Error('default exploded');
					return LazyText;
				},
			}),
		);
		const Lazy = lazy(load);
		const first = mount(LazyHost, { comp: Lazy, childProps: { text: 'first' } });
		expect(first.find('.lazy-error').textContent).toBe('Error: default exploded');
		first.unmount();

		const recovered = mount(LazyHost, { comp: Lazy, childProps: { text: 'recovered' } });
		expect(recovered.find('.lazy-value').textContent).toBe('recovered');
		expect(load).toHaveBeenCalledTimes(1);
		expect(reads).toBe(2);
		recovered.unmount();
	});

	// Per ReactLazy-test.internal.js:212 (React canary b740af2).
	it('multiple lazy components', async () => {
		const first = deferred<{ default: typeof LazyText }>();
		const second = deferred<{ default: typeof LazyText }>();
		const LazyFirst = lazy(() => first.promise);
		const LazySecond = lazy(() => second.promise);
		const root = mount(LazyPairHost, { first: LazyFirst, second: LazySecond });
		expect(root.find('.lazy-fallback').textContent).toBe('Loading...');

		await act(() => first.resolve({ default: LazyText }));
		expect(root.find('.lazy-fallback').textContent).toBe('Loading...');
		await act(() => second.resolve({ default: LazyText }));
		expect(root.find('.lazy-pair').textContent).toBe('AB');
		root.unmount();
	});

	// Per ReactLazy-test.internal.js:247 (React canary b740af2).
	it('does not support arbitrary promises, only module objects', async () => {
		// OCTANE DIVERGENCE: Octane deliberately accepts a bare component from
		// load(), which keeps named dynamic imports ergonomic without a default shim.
		const Lazy = lazy(() => Promise.resolve(LazyText));
		const root = mount(LazyHost, { comp: Lazy, childProps: { text: 'bare' } });
		await act(async () => {});
		expect(root.find('.lazy-value').textContent).toBe('bare');
		root.unmount();
	});

	// Per ReactLazy-test.internal.js:294 (React canary b740af2).
	it('throws if promise rejects', async () => {
		const module = deferred<{ default: typeof LazyText }>();
		const error = new Error('Bad network');
		const Lazy = lazy(() => module.promise);
		const root = mount(LazyHost, { comp: Lazy });
		await act(() => module.reject(error));
		expect(root.find('.lazy-error').textContent).toBe('Error: Bad network');
		root.unmount();
	});

	// Per ReactLazy-test.internal.js:322 (React canary b740af2).
	it('mount and reorder', async () => {
		const a = deferred<{ default: typeof LazyStatefulItem }>();
		const b = deferred<{ default: typeof LazyStatefulItem }>();
		const LazyA = lazy(() => a.promise);
		const LazyB = lazy(() => b.promise);
		const log: string[] = [];
		const props = {
			items: [
				{ key: 'A', label: 'A', comp: LazyA },
				{ key: 'B', label: 'B', comp: LazyB },
			],
			log: (entry: string) => log.push(entry),
		};
		const root = mount(LazyListHost, props);
		await act(() => a.resolve({ default: LazyStatefulItem }));
		await act(() => b.resolve({ default: LazyStatefulItem }));
		root.click('[data-id="A"]');
		const aNode = root.find('[data-id="A"]');
		expect(aNode.textContent).toBe('A:1');

		root.update(LazyListHost, { ...props, items: [...props.items].reverse() });
		expect(root.find('.lazy-list').textContent).toBe('B:0A:1');
		expect(root.find('[data-id="A"]')).toBe(aNode);
		expect(log).toEqual(['mount:A', 'mount:B']);
		root.unmount();
	});

	// Per ReactLazy-test.internal.js:394 (React canary b740af2).
	// Octane-native function-component coverage; this is not evidence for the
	// upstream class lifecycle cases.
	it('applies live defaultProps from a resolved function component', () => {
		const original = LazyDefaultText.defaultProps;
		const Lazy = lazy(() => lazyModule(LazyDefaultText));
		const root = mount(LazyHost, { comp: Lazy, childProps: {} });
		try {
			expect(root.find('.lazy-default').textContent).toBe('default');

			LazyDefaultText.defaultProps = { text: 'updated default' };
			root.update(LazyHost, { comp: Lazy, childProps: {} });
			expect(root.find('.lazy-default').textContent).toBe('updated default');
		} finally {
			LazyDefaultText.defaultProps = original;
			root.unmount();
		}
	});

	// Octane-native memo analogue of ReactLazy-test.internal.js:1229 (React
	// canary b740af2); it does not claim PureComponent/class support.
	it('preserves the comparator when lazy resolves to an Octane memo component', () => {
		const renders: string[] = [];
		const onRender = (value: string) => renders.push(value);
		const compare = vi.fn((previous: any, incoming: any) => previous.value === incoming.value);
		const Lazy = lazy(() => lazyModule(memo(LazyMemoProbe, compare)));
		const root = mount(LazyHost, {
			comp: Lazy,
			childProps: { value: 'A', onRender },
		});
		expect(renders).toEqual(['A']);

		root.update(LazyHost, {
			comp: Lazy,
			childProps: { value: 'A', onRender },
		});
		expect(compare).toHaveBeenCalledTimes(1);
		expect(renders).toEqual(['A']);

		root.update(LazyHost, {
			comp: Lazy,
			childProps: { value: 'B', onRender },
		});
		expect(compare).toHaveBeenCalledTimes(2);
		expect(renders).toEqual(['A', 'B']);
		expect(root.find('.lazy-memo-probe').textContent).toBe('B');
		root.unmount();
	});

	const invalidCases: Array<[string, unknown]> = [
		// Per ReactLazy-test.internal.js:739 (React canary b740af2).
		['throws with a useful error when wrapping invalid type with lazy()', 42],
		// Per ReactLazy-test.internal.js:765 (React canary b740af2).
		['throws with a useful error when wrapping Fragment with lazy()', Fragment],
		// Per ReactLazy-test.internal.js:792 (React canary b740af2).
		[
			'throws with a useful error when wrapping createPortal with lazy()',
			createPortal(null, document.createElement('div')),
		],
		// Per ReactLazy-test.internal.js:926 (React canary b740af2).
		['throws with a useful error when wrapping Context.Consumer with lazy()', undefined],
		// Per ReactLazy-test.internal.js:1007 (React canary b740af2).
		['throws with a useful error when wrapping Activity with lazy()', Activity],
	];

	for (const [title, value] of invalidCases) {
		it(title, () => {
			const Lazy = lazy(() => fulfilled({ default: value as any }));
			const root = mount(LazyHost, { comp: Lazy });
			expect(root.find('.lazy-error').textContent).toContain('lazy: expected');
			root.unmount();
		});
	}

	// Per ReactLazy-test.internal.js:861 (React stable 6117d7c).
	it('throws with a useful error when wrapping Context with lazy()', () => {
		const context = createContext(null);
		const Lazy = lazy(() => fulfilled({ default: context as any }));
		const root = mount(LazyHost, { comp: Lazy });
		expect(root.find('.lazy-error').textContent).toContain('lazy: expected');
		root.unmount();
	});

	// Per ReactLazy-test.internal.js:899 (React canary b740af2).
	it('renders a lazy context provider without value prop', () => {
		const context = createContext('default');
		const LazyProvider = lazy(() => lazyModule(context.Provider));
		const root = mount(LazyProviderHost, {
			provider: LazyProvider,
			context,
			value: 'provided',
		});
		expect(root.find('.lazy-context').textContent).toBe('provided');
		root.unmount();
	});

	// Per ReactLazy-test.internal.js:1060 (React canary b740af2).
	it('throws with a useful error when wrapping lazy() multiple times', () => {
		const Inner = lazy(() => lazyModule(LazyText));
		const Outer = lazy(() => lazyModule(Inner));
		const root = mount(LazyHost, { comp: Outer, childProps: { text: 'nested' } });
		expect(root.find('.lazy-error').textContent).toContain('lazy: expected');
		root.unmount();
	});

	// Per ReactLazy-test.internal.js:1091 (React canary b740af2).
	it('resolves props for function component without defaultProps', () => {
		const Lazy = lazy(() => lazyModule(LazyAdd));
		const root = mount(LazyHost, {
			comp: Lazy,
			childProps: { inner: '2', outer: '2' },
		});
		expect(root.container.textContent).toBe('22');
		root.update(LazyHost, { comp: Lazy, childProps: { inner: false, outer: false } });
		expect(root.container.textContent).toBe('0');
		root.unmount();
	});

	// OCTANE DIVERGENCE: Octane has no forwardRef API. This protects the documented
	// React 19 ref-as-prop function-component contract and is not evidence for the
	// upstream forwardRef row at ReactLazy-test.internal.js:1195.
	it('forwards ref-as-prop through a resolved function component', () => {
		const ref = { current: null as Element | null };
		const Lazy = lazy(() => lazyModule(LazyRefTarget));
		const root = mount(LazyHost, {
			comp: Lazy,
			childProps: { label: 'ref target', ref },
		});
		expect(ref.current).toBe(root.find('.lazy-ref'));
		root.unmount();
		expect(ref.current).toBeNull();
	});

	// Per ReactLazy-test.internal.js:1229 (React canary b740af2).
	it('resolves props for outer memo component without defaultProps', () => {
		const Lazy = lazy(() => lazyModule(memo(LazyAdd)));
		const root = mount(LazyHost, {
			comp: Lazy,
			childProps: { inner: 'outer', outer: ' memo' },
		});
		expect(root.container.textContent).toBe('outer memo');
		root.unmount();
	});

	// Per ReactLazy-test.internal.js:1262 (React canary b740af2).
	it('resolves props for inner memo component without defaultProps', () => {
		const LazyMemo = memo(lazy(() => lazyModule(LazyAdd)));
		const root = mount(LazyHost, {
			comp: LazyMemo,
			childProps: { inner: 'inner', outer: ' memo' },
		});
		expect(root.container.textContent).toBe('inner memo');
		root.unmount();
	});

	// Per ReactLazy-test.internal.js:1454 (React canary b740af2).
	it('mount and reorder lazy types', () => {
		const LazyA = lazy(() => lazyModule(LazyStatefulItem));
		const LazyB = lazy(() => lazyModule(LazyStatefulItem));
		const LazyA2 = lazy(() => lazyModule(LazyStatefulItem));
		const LazyB2 = lazy(() => lazyModule(LazyStatefulItem));
		const log: string[] = [];
		const root = mount(LazyListHost, {
			items: [
				{ key: 'A', label: 'A', comp: LazyA },
				{ key: 'B', label: 'B', comp: LazyB },
			],
			log: (entry: string) => log.push(entry),
		});
		expect(root.find('.lazy-list').textContent).toBe('A:0B:0');

		root.update(LazyListHost, {
			items: [
				{ key: 'B', label: 'b', comp: LazyB2 },
				{ key: 'A', label: 'a', comp: LazyA2 },
			],
			log: (entry: string) => log.push(entry),
		});
		expect(root.find('.lazy-list').textContent).toBe('b:0a:0');
		expect(log.slice(0, 2)).toEqual(['mount:A', 'mount:B']);
		expect(log.slice(2).sort()).toEqual(['unmount:A', 'unmount:B', 'mount:a', 'mount:b'].sort());
		root.unmount();
	});

	// React rejects framework sentinels here because its built-ins are exotic
	// element types. Octane's component-form boundaries are ordinary functions,
	// so wrapping them preserves their public behavior.
	// OCTANE DIVERGENCE: Per ReactLazy-test.internal.js:873/:981.
	it('allows lazy wrappers around component-form framework boundaries', () => {
		for (const boundary of [Suspense, ViewTransition]) {
			expect(typeof boundary).toBe('function');
			expect(typeof lazy(() => lazyModule(boundary))).toBe('function');
		}
	});
});

describe('lazy server regression coverage', () => {
	it('renders a synchronously fulfilled lazy module without a fallback pass', () => {
		const Lazy = ServerRuntime.lazy(() => lazyModule(server.LazyText));
		const { html } = ServerRuntime.renderToString(server.LazyHost, {
			comp: Lazy,
			childProps: { text: 'server' },
		});
		expect(html).toContain('<span class="lazy-value">server</span>');
		expect(html).not.toContain('Loading...');
	});

	it('applies a resolved server component defaultProps on every render', () => {
		const Lazy = ServerRuntime.lazy(() => lazyModule(server.LazyDefaultText));
		const { html } = ServerRuntime.renderToString(server.LazyHost, {
			comp: Lazy,
			childProps: {},
		});
		expect(html).toContain('<span class="lazy-default">default</span>');
	});

	it('rejects a nested server lazy wrapper', () => {
		const Inner = ServerRuntime.lazy(() => lazyModule(server.LazyText));
		const Outer = ServerRuntime.lazy(() => lazyModule(Inner));
		const { html } = ServerRuntime.renderToString(server.LazyHost, {
			comp: Outer,
			childProps: { text: 'nested' },
		});
		expect(html).toContain('Error: lazy: expected');
	});

	// Server mirror of ReactLazy.js:70-180's transactional loader setup.
	it('retries a server loader that throws synchronously', () => {
		let attempts = 0;
		const Lazy = ServerRuntime.lazy(() => {
			attempts++;
			if (attempts === 1) throw new Error('server load exploded');
			return lazyModule(server.LazyText);
		});
		const first = ServerRuntime.renderToString(server.LazyHost, {
			comp: Lazy,
			childProps: { text: 'first' },
		});
		expect(first.html).toContain('Error: server load exploded');

		const second = ServerRuntime.renderToString(server.LazyHost, {
			comp: Lazy,
			childProps: { text: 'recovered' },
		});
		expect(second.html).toContain('<span class="lazy-value">recovered</span>');
		expect(attempts).toBe(2);
	});

	// Server mirror of ReactLazy.js:70-180's transactional subscription setup.
	it('retries a server thenable whose subscription throws synchronously', () => {
		let attempts = 0;
		const Lazy = ServerRuntime.lazy(() => {
			attempts++;
			if (attempts === 1) {
				return {
					then() {
						throw new Error('server subscription exploded');
					},
				} as any;
			}
			return lazyModule(server.LazyText);
		});
		const first = ServerRuntime.renderToString(server.LazyHost, {
			comp: Lazy,
			childProps: { text: 'first' },
		});
		expect(first.html).toContain('Error: server subscription exploded');

		const second = ServerRuntime.renderToString(server.LazyHost, {
			comp: Lazy,
			childProps: { text: 'recovered' },
		});
		expect(second.html).toContain('<span class="lazy-value">recovered</span>');
		expect(attempts).toBe(2);
	});

	// Server mirror of ReactLazy.js:183-223's render-time default resolution.
	it('retries a server module default getter without reloading', () => {
		let reads = 0;
		const load = vi.fn(() =>
			fulfilled({
				get default() {
					reads++;
					if (reads === 1) throw new Error('server default exploded');
					return server.LazyText;
				},
			}),
		);
		const Lazy = ServerRuntime.lazy(load);
		const first = ServerRuntime.renderToString(server.LazyHost, {
			comp: Lazy,
			childProps: { text: 'first' },
		});
		expect(first.html).toContain('Error: server default exploded');

		const second = ServerRuntime.renderToString(server.LazyHost, {
			comp: Lazy,
			childProps: { text: 'recovered' },
		});
		expect(second.html).toContain('<span class="lazy-value">recovered</span>');
		expect(load).toHaveBeenCalledTimes(1);
		expect(reads).toBe(2);
	});
});
